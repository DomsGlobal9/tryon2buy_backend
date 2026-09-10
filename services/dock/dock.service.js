const prisma = require('../../lib/prisma');

/**
 * The photo dock, as something a shop owns rather than something a browser remembers.
 *
 * The dock has always lived in IndexedDB, which ties it to one browser profile on one
 * device: a shop with a counter tablet and an owner's laptop has two unrelated docks, and
 * work done on one is invisible on the other. This makes the dock belong to the ACCOUNT, so
 * everyone signed in with the same credentials sees the same photographs and the same
 * try-ons, wherever they are signed in.
 *
 * Scope is VendorTryon only. The other try-on pages are used by shoppers who have no account
 * at all, so there is nothing to key a shared dock on there; those keep the local browser
 * dock they have always had.
 *
 * Built on the existing Asset table rather than a new one. Asset already carries assetType
 * ('HUMAN_MODEL' for a photograph, 'TRYON_RESULT' for what came out of it) and a vendorId to
 * scope by, so this needs no migration -- which matters here, because the migration history
 * in this repo no longer describes the live database and adding to it is not a small job.
 */

/** Photographs are HUMAN_MODEL assets; results are TRYON_RESULT assets pointing back at one. */
const PHOTO_TYPE = 'HUMAN_MODEL';
const RESULT_TYPE = 'TRYON_RESULT';

/**
 * There is no limit on how many photographs the dock holds.
 *
 * There was a cap of ten, inherited from the browser dock. It is gone deliberately: a cap
 * throws a picture away because a newer one exists, which on a busy counter means losing the
 * customer you are still serving. The twenty-minute window below is the only thing that
 * removes a photograph now, and expiring by time is something people expect in a way that
 * disappearing because somebody else was served is not.
 */

/**
 * How many garments the "tried on" list carries.
 *
 * Capped, unlike photographs, because this list is browsed rather than worked from -- past
 * a screenful it stops being useful and starts being a scroll.
 */
const MAX_GARMENTS = 20;

/**
 * How long a customer's photograph stays in the dock: twenty minutes, then it is gone.
 *
 * The same window the browser dock has always used, and kept for the same reason -- it is a
 * privacy rule, not a cache policy. A photograph of a person who walked out of the shop
 * fifteen minutes ago has no business still being on the counter tablet, and a shop should
 * not have to remember to clear it.
 *
 * This is what makes removing the photo cap safe: nothing accumulates, because everything
 * leaves on its own.
 */
const PHOTO_RETENTION_MS = 20 * 60 * 1000;

/**
 * How long a garment stays in the "tried on" list: the same twenty minutes.
 *
 * One window for everything, deliberately. An argument was made for keeping this longer --
 * "this outfit was tried on" is shop activity rather than somebody's photograph -- but a
 * second, longer clock would outlive the photographs the entries were made from, and the
 * list would name outfits whose try-ons no longer exist. One number is also one thing to
 * explain to a customer, and the promise on screen is twenty minutes.
 */
const GARMENT_RETENTION_MS = PHOTO_RETENTION_MS;

/**
 * Could this string be an id we generated?
 *
 * Not validation for its own sake: a null byte reaches Postgres as an invalid text value and
 * raises, turning "no such photograph" into a 500. Anything with a control character, or
 * absurdly long, cannot name a row we wrote.
 */
function isPlausibleId(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > 200) return false;

  // Compared by code point rather than a regex literal: the escapes needed to express a
  // control-character range are easy to get wrong, and getting them wrong once put a real
  // null byte into this file.
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) < 32) return false;
  }
  return true;
}

const photoCutoff = () => new Date(Date.now() - PHOTO_RETENTION_MS);
const garmentCutoff = () => new Date(Date.now() - GARMENT_RETENTION_MS);

/**
 * How recently a garment has to have been touched to count as "somebody is wearing this".
 *
 * Ninety seconds against a page that beats every thirty: a device that is genuinely open stays
 * comfortably inside the window even if a beat is lost to a bad signal, and a device that has
 * been closed drops out of it within a minute and a half.
 *
 * It exists because deleting an outfit erases the try-ons made with it, and a colleague on
 * another device may be in the middle of exactly that. Nothing here BLOCKS the delete -- a shop
 * has to be able to clear its own list -- but nobody should destroy somebody else's work
 * without being told that is what they are about to do.
 */
const IN_USE_MS = 90 * 1000;

/** Is somebody on another device working with this garment right now? */
const isInUse = (asset) => {
  const at = asset?.metadata?.inUseAt;
  return typeof at === 'number' && (Date.now() - at) < IN_USE_MS;
};

/** Shapes a photo row for the client, without handing over the row's internals. */
const toPhoto = (asset, results = []) => ({
  id: asset.id,
  imageUrl: asset.imageUrl,
  createdAt: asset.createdAt,
  lastUsedAt: asset.metadata?.lastUsedAt ?? asset.createdAt,
  isActive: asset.metadata?.isActive === true,
  results
});

const toResult = (asset) => ({
  id: asset.id,
  resultImageUrl: asset.imageUrl,
  garmentImageUrl: asset.metadata?.garmentImageUrl || '',
  dockPhotoId: asset.metadata?.dockPhotoId || null,
  createdAt: asset.createdAt
});

class DockService {
  /**
   * Everything this account's dock holds: the photographs, and the try-ons made from each.
   */
  async list(vendorId) {
    // Everything this shop has, then expiry decided here rather than in SQL.
    //
    // It has to be done in JavaScript because the clock that matters is lastUsedAt, which
    // lives inside the metadata JSON and is not a column that can be compared in a WHERE.
    // And lastUsedAt is the right clock: picking a photograph up again keeps it alive, so a
    // customer still being served does not lose their picture twenty minutes after it was
    // taken. A createdAt filter would have taken it away mid-fitting.
    const all = await prisma.asset.findMany({
      where: { vendorId, assetType: PHOTO_TYPE },
      orderBy: { createdAt: 'desc' }
    });

    const now = Date.now();
    const lastUsed = (asset) => asset.metadata?.lastUsedAt ?? new Date(asset.createdAt).getTime();

    const live = all.filter(a => now - lastUsed(a) <= PHOTO_RETENTION_MS);
    const expired = all.filter(a => now - lastUsed(a) > PHOTO_RETENTION_MS);

    // Expired photographs are DELETED, not merely hidden. "It disappears after twenty
    // minutes" has to mean the picture is gone, otherwise it is a promise about the interface
    // rather than about the photograph. Swept on read because there is no scheduler here, and
    // reads are frequent enough that nothing lingers long.
    for (const photo of expired) {
      try {
        await this.deletePhoto(vendorId, photo.id);
      } catch (err) {
        // A sweep must never fail the read it was riding along with.
        console.error(`[Dock] could not expire photo ${photo.id}:`, err.message);
      }
    }

    if (live.length === 0) return { photos: [] };

    const results = await this._resultsFor(live.map(p => p.id));

    const byPhoto = new Map(live.map(p => [p.id, []]));
    for (const result of results) {
      const key = result.metadata?.dockPhotoId;
      if (key && byPhoto.has(key)) byPhoto.get(key).push(toResult(result));
    }

    return { photos: live.map(p => toPhoto(p, byPhoto.get(p.id))) };
  }

  /**
   * The shop's garments that customers have actually tried on, most recent first.
   *
   * The point of this list is that it crosses devices: someone at the counter sees what has
   * been tried on today -- including from a colleague's tablet or the owner's laptop -- and
   * can open the same garment and try it on for the customer in front of them.
   *
   * Derived rather than stored. AssetRelation already records product-asset -> try-on result
   * every time a generation runs with a parent, so "what has been tried on" is a fact the
   * database already holds; keeping a second list of it would only be a second thing to get
   * out of step.
   *
   * Scoped through Product.vendorId, which is a real column with a real foreign key -- so
   * unlike the results query below, this one needs no metadata matching to stay inside the
   * right shop.
   */
  async listGarments(vendorId) {
    const products = await prisma.product.findMany({
      where: { vendorId },
      include: { primaryAsset: { select: { id: true, imageUrl: true } } }
    });

    if (products.length === 0) return { garments: [] };

    const byAssetId = new Map(products.map(p => [p.primaryAssetId, p]));

    // Every try-on generated from one of this shop's product photographs.
    const relations = await prisma.assetRelation.findMany({
      where: { parentAssetId: { in: [...byAssetId.keys()] }, createdAt: { gte: garmentCutoff() } },
      orderBy: { createdAt: 'desc' },
      select: { parentAssetId: true, createdAt: true, childAssetId: true }
    });

    const stats = new Map();
    for (const relation of relations) {
      const current = stats.get(relation.parentAssetId);
      if (current) {
        current.tryOnCount += 1;
      } else {
        // relations come newest first, so the first one seen is the most recent
        stats.set(relation.parentAssetId, { tryOnCount: 1, lastTriedAt: relation.createdAt });
      }
    }

    const garments = [...stats.entries()]
      .map(([assetId, stat]) => {
        const product = byAssetId.get(assetId);
        return {
          id: product.id,
          // What the try-on page is addressed by, so picking one is a straight navigation.
          primaryAssetId: product.primaryAssetId,
          title: product.title,
          category: product.category,
          imageUrl: product.primaryAsset?.imageUrl || '',
          tryOnCount: stat.tryOnCount,
          lastTriedAt: stat.lastTriedAt
        };
      })
      .sort((a, b) => new Date(b.lastTriedAt) - new Date(a.lastTriedAt))
      .slice(0, MAX_GARMENTS);

    return { garments };
  }

  /**
   * "Somebody has this open." Called by the try-on page while it is on screen.
   *
   * Deliberately the same shape as touchPhoto, and stored the same way -- a timestamp in the
   * asset's metadata, so there is no migration and nothing new to keep tidy. It answers one
   * question only: should deleting this warn somebody first.
   */
  async touchGarment(vendorId, idOrAssetId) {
    if (!isPlausibleId(idOrAssetId)) return null;

    // Either identifier works. The dock lists garments by PRODUCT id, but the try-on page is
    // addressed by the garment's ASSET id and, on a deep link or a refresh, that is the only
    // one it has. Accepting both means the page can beat without a lookup round trip first.
    const product = await prisma.product.findFirst({
      where: { vendorId, OR: [{ id: idOrAssetId }, { primaryAssetId: idOrAssetId }] },
      select: { primaryAssetId: true }
    });
    if (!product) return null;

    const asset = await prisma.asset.findUnique({ where: { id: product.primaryAssetId } });
    if (!asset) return null;

    await prisma.asset.update({
      where: { id: asset.id },
      data: { metadata: { ...(asset.metadata || {}), inUseAt: Date.now() } }
    });
    return { success: true };
  }

  /**
   * Takes one garment off the "tried on" list, by erasing the try-ons that put it there.
   *
   * The list is not stored anywhere -- listGarments above DERIVES it from the try-on records
   * made against each product's photograph. So there is no row to hide: the only way a
   * garment leaves the list is for the try-ons behind it to go.
   *
   * That makes this the most destructive thing the dock can do, and it is written to be
   * narrow about it:
   *
   *   - the PRODUCT is never touched. The garment stays in the shop's catalogue, keeps its
   *     photograph, and can be tried on again a minute later -- at which point it comes back
   *     into the list. This removes a history, not a piece of stock.
   *   - only the RESULTS are deleted: the images generated from that garment. Deleting the
   *     relation rows alone would leave orphaned results still sitting under their dock
   *     photograph, so the garment would vanish from one tab and its try-ons would remain
   *     visible in the other.
   *   - the relation rows go with them on their own, because AssetRelation cascades from
   *     both ends.
   *
   * Scoped by vendorId through the product, so a garment id belonging to another shop is
   * simply not found -- the same shape as _ownPhoto, and for the same reason.
   */
  async deleteGarment(vendorId, productId, { force = false } = {}) {
    if (!isPlausibleId(productId)) return null;

    const product = await prisma.product.findFirst({
      where: { id: productId, vendorId },
      select: { primaryAssetId: true }
    });
    if (!product) return null;

    // Somebody else is wearing it. Reported rather than refused: the caller is told what they
    // are about to interrupt and can say yes anyway, which is the shop's decision to make.
    // Without this, a tidy-up on the counter tablet silently erased the results a colleague
    // was looking at on the laptop, mid-customer, with no warning to either of them.
    if (!force) {
      const asset = await prisma.asset.findUnique({ where: { id: product.primaryAssetId } });
      if (isInUse(asset)) return { inUse: true };
    }

    const relations = await prisma.assetRelation.findMany({
      where: { parentAssetId: product.primaryAssetId },
      select: { childAssetId: true }
    });

    const childIds = [...new Set(relations.map(r => r.childAssetId))];
    if (childIds.length === 0) {
      // Nothing to erase. Reported as done rather than as a miss: the caller asked for this
      // garment to be off the list, and it already is.
      return { success: true, deletedResults: 0, keptPublished: 0 };
    }

    /**
     * Anything the merchant has PUBLISHED is kept, and this is the most important line here.
     *
     * Publishing works by saving a try-on result to the catalogue -- /api/tryon/catalog/save
     * takes a generation and makes it a Product's primary asset. On this database 23 of the 24
     * products are built that way, so it is not an edge case, it is how the gallery is filled.
     *
     * The first version of this deleted those products to get the assets out of the way, copied
     * from deletePhoto without asking whether it meant the same thing here. It does not.
     * Clearing the "tried on" list is housekeeping on a twenty-minute working list; deleting a
     * product is removing something from the shop. A merchant tidying the dock would have
     * silently emptied their own gallery, and only found out later.
     *
     * So a published result keeps its asset and loses only its LINK to this garment -- which is
     * all the tried-on list is counting, so the outfit still leaves the list exactly as asked.
     */
    const published = await prisma.product.findMany({
      where: { primaryAssetId: { in: childIds } },
      select: { primaryAssetId: true }
    });
    const publishedIds = new Set(published.map(p => p.primaryAssetId));
    const disposable = childIds.filter(id => !publishedIds.has(id));

    // The link goes for every result, published or not: that is what takes the outfit off the
    // list. For the disposable ones the cascade would have done it anyway; doing it explicitly
    // covers the published ones, whose assets are staying put.
    await prisma.assetRelation.deleteMany({
      where: { parentAssetId: product.primaryAssetId, childAssetId: { in: childIds } }
    });

    // deleteMany rather than delete, so two devices removing the same garment at the same
    // moment both succeed instead of one of them 500ing for being second.
    const removed = disposable.length
      ? await prisma.asset.deleteMany({ where: { id: { in: disposable } } })
      : { count: 0 };

    return { success: true, deletedResults: removed.count, keptPublished: publishedIds.size };
  }

  /**
   * Puts an already-uploaded photograph into the dock and makes it the active one.
   *
   * Takes a URL rather than the image itself: the upload endpoint already exists, already
   * normalises orientation and format, and is already what every page uses. Accepting bytes
   * here as well would mean two ways to do the same thing, drifting apart.
   */
  async addPhoto(vendorId, imageUrl) {
    // Created INACTIVE, deliberately.
    //
    // It used to be created active, which meant `create` was a second writer of isActive:
    // two devices adding at the same moment each wrote true before either sweep ran, and the
    // account could be left with TWO active photographs. Intermittent -- roughly one run in
    // eight -- which is the worst kind.
    //
    // Now the UPDATE below is the only thing that ever writes true, and it serialises against
    // other callers through its ordered FOR UPDATE, so "exactly one" holds however many
    // devices are adding at once.
    const photo = await prisma.asset.create({
      data: {
        vendorId,
        assetType: PHOTO_TYPE,
        imageUrl,
        status: 'READY',
        metadata: { isActive: false, lastUsedAt: Date.now() }
      }
    });

    await this._deactivateExcept(vendorId, photo.id);

    // Re-read rather than assume: another device adding in the same instant may legitimately
    // have taken the active spot, and the caller should be told what is actually true.
    const settled = await prisma.asset.findUnique({ where: { id: photo.id } });

    // No trimming. Photographs are unlimited now; the twenty-minute window is what removes
    // them, and it removes them for a reason a person would accept.
    return toPhoto(settled || photo);
  }

  /** Makes one photograph the active one for the whole account. */
  async activatePhoto(vendorId, photoId) {
    const photo = await this._ownPhoto(vendorId, photoId);
    if (!photo) return null;

    const updated = await prisma.asset.update({
      where: { id: photo.id },
      data: { metadata: { ...(photo.metadata || {}), isActive: true, lastUsedAt: Date.now() } }
    });

    await this._deactivateExcept(vendorId, photo.id);
    return toPhoto(updated);
  }

  /** Clears the selection without removing anything. */
  async deactivateAll(vendorId) {
    await this._deactivateExcept(vendorId, null);
    return { success: true };
  }

  /** Says a photograph is still in use, so it is not aged out from under someone. */
  async touchPhoto(vendorId, photoId) {
    const photo = await this._ownPhoto(vendorId, photoId);
    if (!photo) return null;

    /**
     * Two clocks, deliberately, because they answer different questions.
     *
     * lastUsedAt is "when was this last wanted" and drives the twenty-minute expiry.
     * inUseAt is "is somebody looking at it RIGHT NOW" and drives the warning before a
     * delete. A photograph picked up an hour ago and left is expired but not in use; one
     * picked up ten seconds ago is both.
     *
     * touchPhoto only recorded the first, so a photograph could be deleted out from under
     * a colleague mid-customer with no warning -- something that could not happen to a
     * garment, which had both from the start. This makes the two consistent.
     */
    const now = Date.now();
    await prisma.asset.update({
      where: { id: photo.id },
      data: { metadata: { ...(photo.metadata || {}), lastUsedAt: now, inUseAt: now } }
    });
    return { success: true };
  }

  /**
   * Removes a photograph and everything generated from it.
   *
   * The results go too. A try-on is a picture of a person wearing something; leaving those
   * behind after the photograph has been deleted would make "remove this photo" a promise
   * the dock does not keep.
   */
  async deletePhoto(vendorId, photoId, { force = false } = {}) {
    const photo = await this._ownPhoto(vendorId, photoId);
    if (!photo) return null;

    /**
     * Somebody is being fitted with this photograph on another device.
     *
     * The same guard deleteGarment has, and it belongs here more than there: deleting a
     * garment takes an outfit off a list, deleting a PHOTOGRAPH takes away the customer
     * standing in front of somebody. Their try-ons go with it, and so do any gallery items
     * published from them.
     *
     * Reported, not refused. The shop can still say yes -- it is their dock -- but they are
     * told what they are about to interrupt first, which is all that was missing.
     */
    if (!force && isInUse(photo)) return { inUse: true };

    const children = await this._resultsFor([photo.id]);
    const childIds = children.map(c => c.id);

    if (childIds.length > 0) {
      // Product holds its primary asset with onDelete: Restrict, so anything a merchant has
      // published has to be released before the asset underneath it can go.
      await prisma.product.deleteMany({ where: { primaryAssetId: { in: childIds } } });
      await prisma.asset.deleteMany({ where: { id: { in: childIds } } });
    }

    await prisma.product.deleteMany({ where: { primaryAssetId: photo.id } });

    // deleteMany, not delete, because two devices can reach here for the same photograph at
    // the same moment: both find it, both try to remove it, and delete() throws for whichever
    // loses. That surfaced as an intermittent 500 for a request whose only crime was being
    // second. deleteMany removes nothing and says so, which is the honest answer.
    const removed = await prisma.asset.deleteMany({ where: { id: photo.id } });
    if (removed.count === 0) return null;   // somebody else got there first: a 404, not a 500

    return { success: true, deletedResults: childIds.length };
  }

  /**
   * Removes a single try-on, leaving the photograph it came from in place.
   *
   * Ownership is proved through the photograph rather than through the result row, because
   * a result carries no vendorId of its own -- see _resultsFor for why that column is left
   * alone. So: find the result, find the dock photo it names, and check THAT belongs to the
   * caller. A result naming a photograph in someone else's dock is simply not found.
   */
  async deleteResult(vendorId, resultId) {
    if (!isPlausibleId(resultId)) return null;

    const result = await prisma.asset.findFirst({
      where: { id: resultId, assetType: RESULT_TYPE }
    });
    if (!result) return null;

    const photoId = result.metadata?.dockPhotoId;
    if (!photoId) return null;

    const photo = await this._ownPhoto(vendorId, photoId);
    if (!photo) return null;

    await prisma.product.deleteMany({ where: { primaryAssetId: result.id } });

    // Same race as deletePhoto: idempotent removal rather than one that throws on the loser.
    const removed = await prisma.asset.deleteMany({ where: { id: result.id } });
    if (removed.count === 0) return null;

    return { success: true };
  }

  /** Empties the dock for this account. */
  async clear(vendorId) {
    const photos = await prisma.asset.findMany({
      where: { vendorId, assetType: PHOTO_TYPE },
      select: { id: true }
    });

    /**
     * force, and count only what actually went.
     *
     * Both halves of this were wrong the moment deletePhoto learned to refuse a photograph
     * somebody is being fitted with. Without force, "clear the dock" quietly skipped exactly
     * the photographs a colleague had open -- and since any page holding one beats every
     * thirty seconds, that is most of them. The shop pressed clear and the dock stayed.
     *
     * Because the refusal comes back as { inUse: true }, which is truthy, the old
     * `if (await ...) removed++` counted every skipped photograph as removed. The dock
     * reported success for work it had not done, which is worse than not doing it.
     *
     * Forcing is right here rather than propagating the question upward: clear is already
     * the explicit "empty all of this" action, chosen over removing one photograph at a
     * time. The per-photograph warning is where that question belongs, and it still asks.
     */
    let removed = 0;
    for (const photo of photos) {
      const result = await this.deletePhoto(vendorId, photo.id, { force: true });
      if (result?.success) removed++;
    }
    return { success: true, removed };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** A photograph, but only if it belongs to this account. */
  _ownPhoto(vendorId, photoId) {
    // Postgres will not accept a null byte in a text comparison and raises, which surfaced
    // as a 500 for a request that should simply not have matched anything. An id carrying
    // control characters cannot name a row we wrote, so it is a miss, not an error.
    if (!isPlausibleId(photoId)) return Promise.resolve(null);

    return prisma.asset.findFirst({
      where: { id: photoId, vendorId, assetType: PHOTO_TYPE }
    });
  }

  /**
   * The results generated from these photographs.
   *
   * Matched on the dockPhotoId stamped into metadata at generation time, NOT on vendorId.
   * That is deliberate and worth spelling out: /api/tryon/generate stores vendorId as null
   * for a signed-in vendor, and the public shop gallery at /shop/:vendorId lists phase-1
   * assets BY vendorId -- so "fixing" that column to make results findable here would put
   * every private workspace drape on a public page. The photo ids are already scoped to this
   * account, so matching on them is scoped too, without touching anything else.
   *
   * Matching on the image URL would have been the other obvious option and is wrong for a
   * quieter reason: two dock entries can legitimately hold the same photograph, and the link
   * would then be ambiguous.
   */
  _resultsFor(photoIds) {
    if (photoIds.length === 0) return Promise.resolve([]);

    return prisma.asset.findMany({
      where: {
        assetType: RESULT_TYPE,
        createdAt: { gte: garmentCutoff() },
        OR: photoIds.map(id => ({ metadata: { path: ['dockPhotoId'], equals: id } }))
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Exactly one active photograph per account, in a single statement.
   *
   * Two earlier versions of this were wrong, both because of concurrency:
   *
   *   1. Read every photo, then write each back with isActive flipped. Two devices adding at
   *      once each took their snapshot BEFORE the other wrote, so each deactivated the
   *      other's brand-new photograph and the account was left with NONE active.
   *   2. Two UPDATEs in one transaction -- clear, then set. That deadlocked (Postgres 40P01,
   *      reproduced with three simultaneous adds): A's clear locked B's keeper while B's
   *      clear locked A's, and each then waited for the other. One request died with a 500
   *      having already created its photograph.
   *
   *   3. The same single statement, but locking only the rows that were ALREADY active. That
   *      looked tidy and was the subtlest wrong version of the three: concurrent callers
   *      selected disjoint sets -- each new photograph was inactive, so each caller locked
   *      only its own row -- and disjoint locks do not serialise anything. Two or three
   *      photographs could each be set active, roughly a third of the time.
   *
   * So: one statement, locking EVERY photograph this shop has, ordered by id. Locking the
   * whole set is the point -- "exactly one active" is a rule about the set, and a lock on a
   * varying subset cannot enforce it. Everyone locks the same rows in the same order, so
   * callers queue instead of racing, and no two can deadlock. The CASE then sets the keeper
   * true and everything else false in one pass, with no window in between.
   *
   * A null keepId means "nothing active": the comparison is NULL, the CASE falls through to
   * false, and the subquery matches only rows that are currently active.
   */
  async _deactivateExcept(vendorId, keepId) {
    await prisma.$executeRaw`
      UPDATE "tryon_assets" AS a
         SET "metadata" = jsonb_set(
               COALESCE(a."metadata", '{}'::jsonb),
               '{isActive}',
               CASE WHEN a."id" = ${keepId} THEN 'true'::jsonb ELSE 'false'::jsonb END
             )
        FROM (
          SELECT "id"
            FROM "tryon_assets"
           WHERE "vendor_id" = ${vendorId}
             AND "assetType" = ${PHOTO_TYPE}
           ORDER BY "id"
             FOR UPDATE
        ) AS locked
       WHERE a."id" = locked."id"`;
  }

}

module.exports = {
  dockService: new DockService(),
  MAX_GARMENTS,
  PHOTO_RETENTION_MS, GARMENT_RETENTION_MS
};

/**
 * Charging for a generation, and giving the charge back when the generation fails.
 *
 * This logic used to be pasted into /generate, /change-background and /modify-outfit, three
 * copies of the same thing. It had two faults, and fixing them three times over was how they
 * would have drifted apart:
 *
 *   1. The charge was taken BEFORE the AI ran and never returned. A try-on that failed -- a
 *      Gemini refusal, an image that would not download, a storage hiccup -- still cost the
 *      vendor a credit or the guest one of their ten.
 *
 *   2. Guests were counted per IP address. Everyone on a shop's Wi-Fi shares one address, so
 *      the whole shop shared ten free try-ons between every customer in it.
 *
 * Now guests are counted per DEVICE, with a ceiling per network so clearing browser storage
 * is not an unlimited supply. A caller that sends no device id (an older cached copy of the
 * site) is counted per IP exactly as before, so nothing already deployed changes behaviour.
 *
 * No migration: a device's row lives in the existing guestLimit table under the key
 * "<ip>#<deviceId>", beside the plain "<ip>" rows the old counting wrote. The migration
 * history in this repo no longer describes the live database (see services/dock), so a new
 * column was not worth the risk.
 */

/** Free try-ons per guest device. Unchanged from the old per-IP number. */
const GUEST_DEVICE_LIMIT = 10;

/**
 * Free try-ons for ALL guest devices on one network, together.
 *
 * Enough for a busy shop floor, low enough that wiping browser storage in a loop runs dry.
 */
const GUEST_NETWORK_LIMIT = 50;

/** Letters, digits and dashes -- what crypto.randomUUID() produces, with room to spare. */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

const GUEST_LIMIT_BODY = { error: 'GUEST_LIMIT_REACHED', message: 'Login as Vendor for more credits.' };

const clientIp = (req) => req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';

const deviceIdOf = (req) => {
  const raw = req.body && req.body.guest_device_id;
  return typeof raw === 'string' && DEVICE_ID_PATTERN.test(raw) ? raw : null;
};

const NO_REFUND = async () => {};

/** Refund at most once, and never let a failed refund hide the error that caused it. */
const onceOnly = (fn, label) => {
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    try { await fn(); }
    catch (err) { console.error(`[Credits] Refund failed (${label}):`, err.message); }
  };
};

function createCredits(prisma) {
  async function chargeVendor(req, bucket, outOfCreditsMessage) {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.vendorId } });
    if (!vendor) {
      // A valid login for an account that no longer exists. Same code the pages already use
      // for an expired login, so they send the person to sign in rather than showing a
      // free-trial message to somebody who was never on a free trial.
      return { ok: false, status: 401, body: { error: 'SESSION_EXPIRED', message: 'Vendor not found.' } };
    }
    if (vendor.isUnlimited) return { ok: true, refund: NO_REFUND };

    // Conditional decrement: two requests arriving together can no longer both spend the
    // last credit, which the old read-then-write could.
    const taken = await prisma.vendor.updateMany({
      where: { id: req.vendorId, [bucket]: { gt: 0 } },
      data: { [bucket]: { decrement: 1 } }
    });
    if (taken.count === 0) {
      return { ok: false, status: 403, body: { error: 'INSUFFICIENT_CREDITS', message: outOfCreditsMessage } };
    }

    return {
      ok: true,
      refund: onceOnly(
        () => prisma.vendor.update({ where: { id: req.vendorId }, data: { [bucket]: { increment: 1 } } }),
        `vendor ${req.vendorId} ${bucket}`
      )
    };
  }

  /** Every guest row on this network: the old plain-IP row and each device's row. */
  async function networkTotal(ip) {
    const rows = await prisma.guestLimit.findMany({
      where: { OR: [{ ipAddress: ip }, { ipAddress: { startsWith: `${ip}#` } }] },
      select: { tryonCount: true }
    });
    return rows.reduce((sum, row) => sum + (row.tryonCount || 0), 0);
  }

  async function chargeGuest(req) {
    const ip = clientIp(req);
    const deviceId = deviceIdOf(req);
    const key = deviceId ? `${ip}#${deviceId}` : ip;

    if (deviceId && (await networkTotal(ip)) >= GUEST_NETWORK_LIMIT) {
      return { ok: false, status: 401, body: GUEST_LIMIT_BODY };
    }

    let row;
    try {
      row = await prisma.guestLimit.upsert({
        where: { ipAddress: key },
        create: { ipAddress: key, tryonCount: 0 },
        update: {}
      });
    } catch (err) {
      // Two first requests from one new device can both try to create its row; the unique
      // key lets one through and refuses the other. The row exists either way -- read it.
      if (err && err.code === 'P2002') row = await prisma.guestLimit.findUnique({ where: { ipAddress: key } });
      else throw err;
    }

    const taken = await prisma.guestLimit.updateMany({
      where: { id: row.id, tryonCount: { lt: GUEST_DEVICE_LIMIT } },
      data: { tryonCount: { increment: 1 } }
    });
    if (taken.count === 0) return { ok: false, status: 401, body: GUEST_LIMIT_BODY };

    return {
      ok: true,
      refund: onceOnly(
        () => prisma.guestLimit.updateMany({
          where: { id: row.id, tryonCount: { gt: 0 } },
          data: { tryonCount: { decrement: 1 } }
        }),
        `guest ${key}`
      )
    };
  }

  /**
   * Take one credit for this request, or say why not.
   *
   * @returns {{ ok: true, refund: () => Promise<void> } | { ok: false, status: number, body: object }}
   *          On ok, call refund() if the work then fails without the caller getting a result.
   */
  async function chargeCredit(req, { bucket, outOfCreditsMessage }) {
    if (req.userRole === 'vendor') return chargeVendor(req, bucket, outOfCreditsMessage);
    if (req.userRole === 'guest') return chargeGuest(req);
    // A customer login has never been charged here. Unchanged.
    return { ok: true, refund: NO_REFUND };
  }

  return { chargeCredit };
}

module.exports = { createCredits, GUEST_DEVICE_LIMIT, GUEST_NETWORK_LIMIT };

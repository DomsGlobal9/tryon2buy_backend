const express = require('express');
const { authenticateVendor } = require('../middleware/auth');
const { dockService } = require('../services/dock');

/**
 * The shop's photo dock, over HTTP.
 *
 * Every route requires a signed-in account and is scoped to that account's vendorId, taken
 * from the token and never from the request. That is what makes the dock shared between a
 * counter tablet and an owner's laptop, and equally what keeps one shop's photographs out of
 * another's.
 *
 * VendorTryon only. The shopper-facing try-on pages have no credentials, so there is nothing
 * to key a shared dock on there; they keep the local browser dock.
 */
const router = express.Router();

/** Backend detail never reaches the caller, matching the rule the try-on routes follow. */
function fail(res, err, where) {
  console.error(`[Dock] ${where}:`, err);
  res.status(500).json({ error: 'Dock unavailable.' });
}

/** Everything this account's dock holds. */
router.get('/api/tryon/dock', authenticateVendor, async (req, res) => {
  try {
    res.json(await dockService.list(req.vendorId));
  } catch (err) {
    fail(res, err, 'list');
  }
});

/**
 * The shop's garments that customers have tried on, most recent first.
 *
 * Read from every device the account is signed in on, which is the point: whoever is serving
 * a customer can see what has been tried today -- on any tablet, by any colleague -- and open
 * the same garment to try it on for the person in front of them.
 */
router.get('/api/tryon/dock/garments', authenticateVendor, async (req, res) => {
  try {
    res.json(await dockService.listGarments(req.vendorId));
  } catch (err) {
    fail(res, err, 'listGarments');
  }
});

/** Put an already-uploaded photograph into the dock, and make it the active one. */
router.post('/api/tryon/dock/photos', authenticateVendor, async (req, res) => {
  try {
    const { imageUrl } = req.body || {};

    // https only. This URL is handed to every device on the account and rendered there, and
    // a page that renders whatever it is given can be made to render anything at all.
    if (typeof imageUrl !== 'string' || !/^https:\/\/[^\s]+$/i.test(imageUrl)) {
      return res.status(400).json({ error: 'A valid https imageUrl is required.' });
    }

    res.status(201).json(await dockService.addPhoto(req.vendorId, imageUrl));
  } catch (err) {
    fail(res, err, 'addPhoto');
  }
});

/** Make one photograph the active one for the whole account. */
router.post('/api/tryon/dock/photos/:id/activate', authenticateVendor, async (req, res) => {
  try {
    const photo = await dockService.activatePhoto(req.vendorId, req.params.id);
    if (!photo) return res.status(404).json({ error: 'Photo not found.' });
    res.json(photo);
  } catch (err) {
    fail(res, err, 'activatePhoto');
  }
});

/** Keep the photographs, clear the selection. */
router.post('/api/tryon/dock/deactivate', authenticateVendor, async (req, res) => {
  try {
    res.json(await dockService.deactivateAll(req.vendorId));
  } catch (err) {
    fail(res, err, 'deactivateAll');
  }
});

/** Say a photograph is still in use, so it is not aged out from under someone. */
router.post('/api/tryon/dock/photos/:id/touch', authenticateVendor, async (req, res) => {
  try {
    const touched = await dockService.touchPhoto(req.vendorId, req.params.id);
    if (!touched) return res.status(404).json({ error: 'Photo not found.' });
    res.json(touched);
  } catch (err) {
    fail(res, err, 'touchPhoto');
  }
});

/** Remove a photograph and everything generated from it. */
router.delete('/api/tryon/dock/photos/:id', authenticateVendor, async (req, res) => {
  try {
    // ?force=1 is the second press, after the caller has been told somebody is using it.
    const force = req.query.force === '1' || req.query.force === 'true';
    const removed = await dockService.deletePhoto(req.vendorId, req.params.id, { force });
    if (!removed) return res.status(404).json({ error: 'Photo not found.' });

    // 409 for the same reason garments use it: the request is well formed and will succeed
    // the moment the other device puts it down, or immediately if the caller goes ahead.
    if (removed.inUse) {
      return res.status(409).json({
        error: 'Someone is being fitted with this photo right now.',
        inUse: true
      });
    }

    res.json(removed);
  } catch (err) {
    fail(res, err, 'deletePhoto');
  }
});

/**
 * Take a garment off the "tried on" list.
 *
 * DELETE, and it means it: the list is derived from try-on records, so the only way a garment
 * leaves it is for those records to go. The garment itself stays in the catalogue -- see
 * dockService.deleteGarment, which is deliberately narrow about what it removes.
 *
 * Shared, like every other route here. One person clearing the list clears it for the shop,
 * which is the same bargain the dock makes everywhere else: what one device does, the others
 * see.
 */
router.delete('/api/tryon/dock/garments/:id', authenticateVendor, async (req, res) => {
  try {
    // ?force=1 is the second press, after the caller has been told somebody is wearing it.
    const force = req.query.force === '1' || req.query.force === 'true';
    const removed = await dockService.deleteGarment(req.vendorId, req.params.id, { force });
    if (!removed) return res.status(404).json({ error: 'Outfit not found.' });

    // 409, not 403: the request is perfectly well formed and will succeed the moment the
    // other device puts it down -- or immediately, if the caller decides to go ahead anyway.
    // The interface turns this into a second confirmation rather than a refusal.
    if (removed.inUse) {
      return res.status(409).json({
        error: 'Someone is trying this outfit on right now.',
        inUse: true
      });
    }

    res.json(removed);
  } catch (err) {
    fail(res, err, 'deleteGarment');
  }
});

/**
 * "Somebody has this outfit open."
 *
 * Beaten by the try-on page while it is on screen, so that deleting the outfit on another
 * device can warn about interrupting a colleague instead of doing it silently. Best effort by
 * design -- a lost beat costs a warning, never anybody's work.
 */
router.post('/api/tryon/dock/garments/:id/touch', authenticateVendor, async (req, res) => {
  try {
    const touched = await dockService.touchGarment(req.vendorId, req.params.id);
    if (!touched) return res.status(404).json({ error: 'Outfit not found.' });
    res.json(touched);
  } catch (err) {
    fail(res, err, 'touchGarment');
  }
});

/** Remove a single try-on, keeping the photograph it came from. */
router.delete('/api/tryon/dock/results/:id', authenticateVendor, async (req, res) => {
  try {
    const removed = await dockService.deleteResult(req.vendorId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Result not found.' });
    res.json(removed);
  } catch (err) {
    fail(res, err, 'deleteResult');
  }
});

/** Empty the dock for this account. */
router.delete('/api/tryon/dock', authenticateVendor, async (req, res) => {
  try {
    res.json(await dockService.clear(req.vendorId));
  } catch (err) {
    fail(res, err, 'clear');
  }
});

module.exports = router;

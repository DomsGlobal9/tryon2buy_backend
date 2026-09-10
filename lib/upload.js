const multer = require('multer');

// Multer: store in memory for direct Supabase upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const mimetype = file.mimetype || '';

    if (mimetype.startsWith('image/')) return cb(null, true);

    // A typeless upload is not the same thing as a non-image upload.
    //
    // iOS hands back Files from IndexedDB with an empty `type`, and FormData then sends
    // application/octet-stream. Rejecting on that alone threw away perfectly good
    // photographs -- verified: the same JPEG is accepted with image/jpeg and refused with
    // application/octet-stream. The customer was told their image was invalid.
    //
    // Nothing is actually trusted here either way: sharp decodes the buffer immediately
    // afterwards and is the real arbiter of whether this is an image, so a mislabelled
    // non-image still fails, just with an honest reason.
    // Deliberately no filename-extension check alongside this. One was written and removed:
    // it accepted either way, so it decided nothing, and anyone sending a mislabelled file
    // would simply leave the extension off. sharp decoding the buffer is the only check here
    // that cannot be talked around, so it is the only one relied on.
    if (mimetype === 'application/octet-stream' || mimetype === '') return cb(null, true);

    cb(new Error('Only image files are allowed.'));
  },
});

module.exports = upload;

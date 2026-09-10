/**
 * The shop's photo dock.
 *
 * One responsibility: the photographs a signed-in account is working from, and the try-ons
 * made from each, shared across every device that account is signed in on.
 *
 * Its own folder rather than another section of tryon.routes.js, because it answers a
 * different question from the rest of that file. Everything there is about producing an
 * image; this is about which images a shop currently has to hand.
 *
 * Importers take this folder, not the file inside it.
 */
module.exports = require('./dock.service');

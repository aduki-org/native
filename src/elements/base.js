/**
 * src/elements/base.js
 *
 * Elements Base boundary.
 * Re-exports the unified lifecycle BaseElement class as `Base` to maintain
 * clean architectural limits for custom components authoring.
 *
 * Source: doc 04 — Web Components §1
 */

import { BaseElement } from '../core/ui/base.js';
export { BaseElement as Base };

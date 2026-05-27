import { define } from './define.js';
import { element } from './element.js';
import { container } from './container.js';
import { initOrchestrator } from './orchestrator.js';

// Initialize the global routing orchestrator
initOrchestrator();

export { define, element, container };

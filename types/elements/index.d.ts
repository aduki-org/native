/**
 * types/elements/index.d.ts
 *
 * TypeScript declarations for all 42 premium UI custom elements.
 */

import { BaseElement } from '../core/ui/index.d.ts';

// 1. Primitive Elements
export class Button extends BaseElement {}
export class Icon extends BaseElement {}
export class Badge extends BaseElement {}
export class Avatar extends BaseElement {}
export class Divider extends BaseElement {}
export class Text extends BaseElement {}
export class Link extends BaseElement {}
export class Spinner extends BaseElement {}

// 2. Form Controls
export class Input extends BaseElement {
  value: string;
  readonly validity: ValidityState;
}
export class Textarea extends BaseElement {
  value: string;
  readonly validity: ValidityState;
}
export class Select extends BaseElement {
  value: string;
  readonly validity: ValidityState;
}
export class Checkbox extends BaseElement {
  checked: boolean;
  readonly validity: ValidityState;
}
export class Radio extends BaseElement {
  checked: boolean;
  readonly validity: ValidityState;
}
export class Toggle extends BaseElement {
  checked: boolean;
  readonly validity: ValidityState;
}
export class Field extends BaseElement {}
export class Upload extends BaseElement {
  readonly files: File[];
}
export class Form extends BaseElement {}

// 3. Overlay System
export class Dialog extends BaseElement {}
export class Popover extends BaseElement {}
export class Tooltip extends BaseElement {}
export class Menu extends BaseElement {}
export class Drawer extends BaseElement {}
export class Sheet extends BaseElement {}

// 4. Feedback Elements
export class Alert extends BaseElement {}
export class Toast extends BaseElement {}
export class Progress extends BaseElement {
  value: number;
  max: number;
}
export class Skeleton extends BaseElement {}
export class Empty extends BaseElement {}

// 5. Data Elements
export class Table extends BaseElement {}
export class List extends BaseElement {}
export class Card extends BaseElement {}
export class Chart extends BaseElement {}
export class Stat extends BaseElement {}

// 6. Navigation System
export class Nav extends BaseElement {}
export class Tabs extends BaseElement {
  value: string;
}
export class Breadcrumb extends BaseElement {}
export class Pagination extends BaseElement {}
export class Steps extends BaseElement {}

// 7. Layout System
export class App extends BaseElement {}
export class Header extends BaseElement {}
export class Sidebar extends BaseElement {}
export class Stack extends BaseElement {}
export class Grid extends BaseElement {}
export class Split extends BaseElement {}
export class Scroll extends BaseElement {}
export class Surface extends BaseElement {}

// Add global JSX / Custom Element type bindings
declare global {
  interface HTMLElementTagNameMap {
    'ui-button': Button;
    'ui-icon': Icon;
    'ui-badge': Badge;
    'ui-avatar': Avatar;
    'ui-divider': Divider;
    'ui-text': Text;
    'nav-link': Link;
    'ui-spinner': Spinner;

    'ui-input': Input;
    'ui-textarea': Textarea;
    'ui-select': Select;
    'ui-checkbox': Checkbox;
    'ui-radio': Radio;
    'ui-toggle': Toggle;
    'ui-field': Field;
    'ui-upload': Upload;
    'ui-form': Form;

    'ui-dialog': Dialog;
    'ui-popover': Popover;
    'ui-tooltip': Tooltip;
    'ui-menu': Menu;
    'ui-drawer': Drawer;
    'ui-sheet': Sheet;

    'ui-alert': Alert;
    'ui-toast': Toast;
    'ui-progress': Progress;
    'ui-skeleton': Skeleton;
    'ui-empty': Empty;

    'ui-table': Table;
    'ui-list': List;
    'ui-card': Card;
    'ui-chart': Chart;
    'ui-stat': Stat;

    'ui-nav': Nav;
    'ui-tabs': Tabs;
    'ui-breadcrumb': Breadcrumb;
    'ui-pagination': Pagination;
    'ui-steps': Steps;

    'ui-app': App;
    'ui-header': Header;
    'ui-sidebar': Sidebar;
    'ui-stack': Stack;
    'ui-grid': Grid;
    'ui-split': Split;
    'ui-scroll': Scroll;
    'ui-surface': Surface;
  }
}

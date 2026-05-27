/**
 * src/elements/index.js
 *
 * Public Custom Elements Entry Point.
 * Imports and consolidates all UI custom element primitives, forms, overlay,
 * feedback, data, navigation, and layout modules.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §1
 */

// 1. Primitive Elements
import './primitives/button/index.js';
import './primitives/icon/index.js';
import './primitives/badge/index.js';
import './primitives/avatar/index.js';
import './primitives/divider/index.js';
import './primitives/text/index.js';
import './primitives/link/index.js';
import './primitives/spinner/index.js';

const Button = typeof customElements !== 'undefined' ? customElements.get('ui-button') : null;
const Icon = typeof customElements !== 'undefined' ? customElements.get('ui-icon') : null;
const Badge = typeof customElements !== 'undefined' ? customElements.get('ui-badge') : null;
const Avatar = typeof customElements !== 'undefined' ? customElements.get('ui-avatar') : null;
const Divider = typeof customElements !== 'undefined' ? customElements.get('ui-divider') : null;
const Text = typeof customElements !== 'undefined' ? customElements.get('ui-text') : null;
const Link = typeof customElements !== 'undefined' ? customElements.get('nav-link') : null;
const Spinner = typeof customElements !== 'undefined' ? customElements.get('ui-spinner') : null;

// 2. Form Controls
import { Input } from './forms/input.js';
import { Textarea } from './forms/textarea.js';
import { Select } from './forms/select.js';
import { Checkbox } from './forms/checkbox.js';
import { Radio } from './forms/radio.js';
import { Toggle } from './forms/toggle.js';
import { Field } from './forms/field.js';
import { Upload } from './forms/upload.js';
import { Form } from './forms/form.js';

// 3. Overlay System
import { Dialog } from './overlay/dialog.js';
import { Popover } from './overlay/popover.js';
import { Tooltip } from './overlay/tooltip.js';
import { Menu } from './overlay/menu.js';
import { Drawer } from './overlay/drawer.js';
import { Sheet } from './overlay/sheet.js';

// 4. Feedback Elements
import { Alert } from './feedback/alert.js';
import { Toast } from './feedback/toast.js';
import { Progress } from './feedback/progress.js';
import { Skeleton } from './feedback/skeleton.js';
import { Empty } from './feedback/empty.js';

// 5. Data Elements
import { Table } from './data/table.js';
import { List } from './data/list.js';
import { Card } from './data/card.js';
import { Chart } from './data/chart.js';
import { Stat } from './data/stat.js';

// 6. Navigation System
import { Nav } from './navigation/nav.js';
import { Tabs } from './navigation/tabs.js';
import { Breadcrumb } from './navigation/breadcrumb.js';
import { Pagination } from './navigation/pagination.js';
import { Steps } from './navigation/steps.js';

// 7. Layout System
import { App } from './layout/app.js';
import { Header } from './layout/header.js';
import { Sidebar } from './layout/sidebar.js';
import { Stack } from './layout/stack.js';
import { Grid } from './layout/grid.js';
import { Split } from './layout/split.js';
import { Scroll } from './layout/scroll.js';
import { Surface } from './layout/surface.js';

export {
  // Primitives
  Button,
  Icon,
  Badge,
  Avatar,
  Divider,
  Text,
  Link,
  Spinner,

  // Forms
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Toggle,
  Field,
  Upload,
  Form,

  // Overlay
  Dialog,
  Popover,
  Tooltip,
  Menu,
  Drawer,
  Sheet,

  // Feedback
  Alert,
  Toast,
  Progress,
  Skeleton,
  Empty,

  // Data
  Table,
  List,
  Card,
  Chart,
  Stat,

  // Navigation
  Nav,
  Tabs,
  Breadcrumb,
  Pagination,
  Steps,

  // Layout
  App,
  Header,
  Sidebar,
  Stack,
  Grid,
  Split,
  Scroll,
  Surface
};

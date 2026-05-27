# Custom Elements and Forms Integration Guide

This guide demonstrates how to build and interact with the platform's premium, form-associated Custom Elements and layout components.

---

## 1. Building High-Performance Forms

The custom form-control elements (such as `<ui-input>`, `<ui-select>`, etc.) implement native browser `ElementInternals`. This allows them to register validations and bind standard form inputs natively without hacky wrapping.

Below is a complete HTML structure demonstrating an interactive profile update form:

```html
<!-- Native Form with Premium Elements -->
<ui-form id="profile-form">
  <ui-field label="Display Name" hint="Enter your publicly visible name">
    <ui-input 
      name="displayName" 
      required 
      placeholder="e.g. John Doe">
    </ui-input>
  </ui-field>

  <ui-field label="Select Country">
    <ui-select name="country">
      <option value="us">United States</option>
      <option value="uk">United Kingdom</option>
      <option value="ca">Canada</option>
    </ui-select>
  </ui-field>

  <ui-field label="Accept Terms">
    <ui-checkbox name="acceptTerms" required></ui-checkbox>
  </ui-field>

  <ui-button type="submit" variant="primary">
    Save Profile
  </ui-button>
</ui-form>
```

### Form Submission Handling
In your application logic, listen to the standard form events. If the user goes offline, `<ui-form>` handles enqueuing operations automatically inside IndexedDB:

```javascript
import { events } from 'core/events';
import { offline } from 'core/offline';

const form = document.getElementById('profile-form');

// Listen to valid form submissions
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  
  // Extract parsed form values as standard key-value maps
  const formData = form.value; 
  console.log('Submitting profile data:', formData);

  const isOnline = await offline.check();
  if (!isOnline) {
    // Enqueue task offline with automatic syncing back online
    await offline.queue.push('profile:update', formData, {
      idempotencyKey: `profile-${Date.now()}`
    });
    alert('You are currently offline. Changes will be synced automatically once online!');
    return;
  }

  // Execute request online
  await executeRequest(formData);
});
```

---

## 2. Interactive Overlays (Dialog and Popover)

The overlays leverage standard browser features: native `<dialog>` modal focus-trapping and the native browser Popover API for top-layer placement.

### Declarative Dialog modal:
```html
<ui-dialog id="alert-modal">
  <ui-text slot="header" variant="h3">Unsaved Changes</ui-text>
  
  <ui-text>You have unsaved changes. Are you sure you want to exit?</ui-text>
  
  <div slot="footer">
    <ui-button id="btn-cancel" variant="ghost">Cancel</ui-button>
    <ui-button id="btn-confirm" variant="primary">Exit</ui-button>
  </div>
</ui-dialog>
```

### Controlling from Javascript:
```javascript
const dialog = document.getElementById('alert-modal');

// Show modal (handles focus trap and ESC dismissal natively)
dialog.showModal();

// Close modal
dialog.close();
```

---

## 3. Dynamic Roving Tabindex Navigations

Elements like `<ui-tabs>` and `<ui-menu>` enforce keyboard accessibility standard contracts. Arrow key selections move active states, updating focus dynamically:

```html
<ui-tabs value="profile">
  <ui-tab-list>
    <!-- Roving tabindex uses arrows keys to move focus naturally -->
    <ui-tab value="profile">Profile Details</ui-tab>
    <ui-tab value="security">Security Options</ui-tab>
    <ui-tab value="billing">Billing Info</ui-tab>
  </ui-tab-list>

  <ui-tab-panel value="profile">
    <ui-text>Profile options layout...</ui-text>
  </ui-tab-panel>
  <ui-tab-panel value="security">
    <ui-text>Security settings layout...</ui-text>
  </ui-tab-panel>
  <ui-tab-panel value="billing">
    <ui-text>Billing details layout...</ui-text>
  </ui-tab-panel>
</ui-tabs>
```

# Props — Element Properties & Attribute Reflection

**Scope:** The property (`props`) definition layer of the custom element factory.  
**Goal:** Deliver elegant, type-safe, and highly-performant attribute-to-property synchronization natively.

---

## 1. Property-to-Attribute Mirroring

Web Components are consumed in two ways: declaratively via HTML attributes (`<ui-button disabled></ui-button>`) and imperatively via JavaScript properties (`button.disabled = true`).

Maintaining synchronization between these two worlds is traditionally a major source of bugs and code bloat. The `ui.element` factory automates this mapping using a declarative configuration schema.

### Property Configuration Schema (`props`)

Each key inside the `props` object defines a reactive property on the element instance:

```javascript
props: {
  disabled: { type: Boolean, reflect: true },
  value:    { type: String, default: '' },
  limit:    { type: Number, default: 10, reflect: true }
}
```

---

## 2. Type Casting and Defaults

Custom element attributes are natively strings. To provide a first-class developer experience, the library automatically casts attributes to appropriate JavaScript types during gets and sets:

1. **`Boolean`:**
   - **HTML Representation:** Boolean attributes are existential (`disabled` or absent).
   - **Casting Rules:**
     - Getting returns `true` if the attribute exists, and `false` if it does not.
     - Setting `true` sets the attribute to an empty string (`setAttribute('disabled', '')`). Setting `false` removes the attribute.
2. **`Number`:**
   - **HTML Representation:** Numeric string values (`limit="25"`).
   - **Casting Rules:**
     - Getting returns `Number(attributeValue)`. If the attribute is absent, it returns the defined `default` value.
     - Setting casts the value to a string and sets the attribute.
3. **`String`:**
   - **Casting Rules:** Returns the raw string attribute, falling back to the defined `default` value if the attribute is absent.

---

## 3. Attribute Reflection (`reflect: true`)

Attribute reflection ensures that changing a JavaScript property (e.g., `element.disabled = true`) automatically updates the HTML DOM representation (adding the `disabled` attribute to the host tag).

### The Synchronisation Loop Prevention

To prevent endless update loops (where a property update triggers an attribute change, which triggers the observed callback, which updates the property again), the dynamic getters and setters implement a **strict value check guard**:

```javascript
set(val) {
  const old = this[name];
  // Strict guard protects against infinite bounce loops
  if (old === val) return; 

  // Perform casting and attribute reflection
  if (config.type === Boolean) {
    val ? this.setAttribute(name, '') : this.removeAttribute(name);
  } else {
    val === null || val === undefined 
      ? this.removeAttribute(name) 
      : this.setAttribute(name, String(val));
  }
}
```

---

## 4. Custom States Integration (`state: true`)

For properties declared with `state: true`, changes are automatically mirrored directly to custom state pseudo-classes (`:state()`) using the browser's native `ElementInternals.states` API.

- **Why it's premium:** The browser natively recognizes custom state pseudo-classes, which executes styling swaps with absolute peak performance, entirely avoiding heavy classes manipulations (like `classList.add('is-loading')`) and keeping the DOM clean.

```javascript
// Inside property setter
if (config.state && this.#internals) {
  val 
    ? this.#internals.states.add(name) 
    : this.#internals.states.delete(name);
}
```

---

## 5. Performance Scheduling & Batched Updates

Updating a property shouldn't trigger synchronous page reflows or immediate layout recalculations, especially when multiple properties are updated in the same execution frame.

The factory handles reactive updates using our unified **Cooperative Task Scheduler (`ui.scheduleFrame`)**:

```javascript
// Schedule update to run in the next browser animation frame
if (this.#initialized && spec.update) {
  ui.scheduleFrame(() => spec.update({ el: this, name, val, old }));
}
```

By batching property update reactions into a single animation frame callback, the system prevents layout thrashing, secures the 60fps/120fps UI render pipeline, and guarantees fluid interface interactions.

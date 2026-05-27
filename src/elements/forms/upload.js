/**
 * src/elements/forms/upload.js
 *
 * Form Control: <ui-upload>
 * Highly interactive Drag-and-Drop file uploader primitive leveraging the
 * standard core API progress-tracked upload wrapper.
 *
 * Source: doc 04 — Web Components §3, doc 11 — Networking §14
 */

import { Base } from '../base.js';
import { upload } from '../../core/api/upload.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-sans);
      width: 100%;
      /* Component Tokens — Semantic Reference Only */
      --upload-bg:           var(--color-surface-page);
      --upload-border:       var(--color-border-default);
      --upload-border-focus: var(--color-border-focus);
      --upload-radius:       var(--radius-lg);
      --upload-padding:      var(--space-8);
      --upload-color:        var(--color-content-secondary);
    }

    .dropzone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      background: var(--upload-bg);
      border: var(--space-0-5) dashed var(--upload-border);
      border-radius: var(--upload-radius);
      padding: var(--upload-padding);
      text-align: center;
      cursor: pointer;
      color: var(--upload-color);
      transition: 
        border-color var(--duration-fast) var(--ease-out),
        background-color var(--duration-fast) var(--ease-out);
    }

    .dropzone.highlight {
      border-color: var(--upload-border-focus);
      background: var(--color-interactive-disabled);
    }

    input[type="file"] {
      display: none;
    }

    .text-main {
      font-weight: var(--font-weight-medium);
      color: var(--color-content-primary);
    }

    .progress-bar {
      width: 100%;
      height: var(--space-1-5);
      background: var(--color-border-default);
      border-radius: var(--radius-full);
      overflow: hidden;
      display: none;
      margin-top: var(--space-4);
    }

    .progress-fill {
      height: 100%;
      width: 0%;
      background: var(--color-interactive);
      transition: width var(--duration-fast) var(--ease-out);
    }
  </style>
  <div class="dropzone" part="dropzone">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
    </svg>
    <div>
      <span class="text-main">Click to upload</span> or drag and drop
    </div>
    <div style="font-size: var(--font-size-xs)">Select file to begin</div>
    <input type="file" />
    <div class="progress-bar" part="progress">
      <div class="progress-fill" part="progress-fill"></div>
    </div>
  </div>
`;

export class Upload extends Base {
  static observedAttributes = ['url', 'multiple', 'accept'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const dropzone = this.shadowRoot.querySelector('.dropzone');
    const fileInput = this.shadowRoot.querySelector('input[type="file"]');

    // Click triggers hidden file selector picker
    dropzone.addEventListener('click', () => fileInput.click(), { signal: this.ctrl.signal });

    // File selection changes
    fileInput.addEventListener('change', this.#onFileSelect, { signal: this.ctrl.signal });

    // Drag-and-drop listener events
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
      dropzone.addEventListener(event, prevent, { signal: this.ctrl.signal });
    });

    ['dragenter', 'dragover'].forEach((event) => {
      dropzone.addEventListener(event, () => dropzone.classList.add('highlight'), { signal: this.ctrl.signal });
    });

    ['dragleave', 'drop'].forEach((event) => {
      dropzone.addEventListener(event, () => dropzone.classList.remove('highlight'), { signal: this.ctrl.signal });
    });

    dropzone.addEventListener('drop', this.#onDrop, { signal: this.ctrl.signal });

    this.#syncAttributes();
  }

  #syncAttributes() {
    const fileInput = this.shadowRoot.querySelector('input[type="file"]');
    if (this.hasAttribute('multiple')) {
      fileInput.setAttribute('multiple', '');
    } else {
      fileInput.removeAttribute('multiple');
    }

    if (this.hasAttribute('accept')) {
      fileInput.setAttribute('accept', this.getAttribute('accept'));
    } else {
      fileInput.removeAttribute('accept');
    }
  }

  #onFileSelect = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      this.#processFiles(files);
    }
  };

  #onDrop = (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.#processFiles(files);
    }
  };

  async #processFiles(files) {
    const url = this.getAttribute('url');
    if (!url) {
      this.dispatchEvent(new CustomEvent('selected', { detail: { files }, bubbles: true, composed: true }));
      return;
    }

    const progressBar = this.shadowRoot.querySelector('.progress-bar');
    const progressFill = this.shadowRoot.querySelector('.progress-fill');
    progressBar.style.display = 'block';

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }

      await upload(url, formData, {
        onProgress: (p) => {
          progressFill.style.width = `${p.percentage}%`;
          this.dispatchEvent(new CustomEvent('progress', { detail: p, bubbles: true, composed: true }));
        },
        signal: this.ctrl.signal
      });

      progressFill.style.width = '100%';
      this.dispatchEvent(new CustomEvent('success', { detail: { files }, bubbles: true, composed: true }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('error', { detail: err, bubbles: true, composed: true }));
    } finally {
      setTimeout(() => {
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
      }, 1000);
    }
  }
}

customElements.define('ui-upload', Upload);

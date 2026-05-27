import { assetCache } from './state.js';

/**
 * Preloads style and HTML template resources asynchronously exactly once.
 */
export async function preloadResources(tag, styleUrl, templateUrl, inlineTemplate, inlineStyle) {
  let templateNode = null;
  let stylesheet = null;
  let tagsDescriptor = null;

  // Compile / Fetch styles
  if (styleUrl) {
    if (assetCache.has(styleUrl)) {
      stylesheet = assetCache.get(styleUrl);
    } else {
      stylesheet = new CSSStyleSheet();
      try {
        const res = await fetch(styleUrl);
        if (res.ok) {
          const css = await res.text();
          stylesheet.replaceSync(css);
          assetCache.set(styleUrl, stylesheet);
        }
      } catch (err) {
        console.error(`Failed to load style resource for element ${tag}:`, err);
      }
    }
  } else if (inlineStyle) {
    stylesheet = new CSSStyleSheet();
    stylesheet.replaceSync(inlineStyle);
  }

  // Compile / Fetch Template markup
  if (templateUrl) {
    if (assetCache.has(templateUrl)) {
      templateNode = assetCache.get(templateUrl);
    } else {
      try {
        const res = await fetch(templateUrl);
        if (res.ok) {
          const html = await res.text();
          templateNode = createTemplateFragment(html);
          assetCache.set(templateUrl, templateNode);
        }
      } catch (err) {
        console.error(`Failed to fetch template resource for element ${tag}:`, err);
      }
    }
    
    // Fetch Tags Descriptor
    const tagsUrl = templateUrl.replace(/\.html$/, '.tags.json');
    if (assetCache.has(tagsUrl)) {
      tagsDescriptor = assetCache.get(tagsUrl);
    } else {
      try {
        const res = await fetch(tagsUrl);
        if (res.ok) {
          tagsDescriptor = await res.json();
          assetCache.set(tagsUrl, tagsDescriptor);
        }
      } catch (err) {
        // Safe to ignore, not all elements have or need a tags descriptor
      }
    }
  } else if (inlineTemplate) {
    templateNode = createTemplateFragment(inlineTemplate);
  }

  return { templateNode, stylesheet, tagsDescriptor };
}

/**
 * Compiles an HTML string into a DocumentFragment utilizing the fastest native methods.
 */
export function createTemplateFragment(htmlString) {
  const tpl = document.createElement('template');
  if (typeof tpl.setHTMLUnsafe === 'function') {
    tpl.setHTMLUnsafe(htmlString);
  } else {
    tpl.innerHTML = htmlString;
  }
  return tpl.content;
}

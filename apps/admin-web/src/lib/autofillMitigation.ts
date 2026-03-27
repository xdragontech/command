const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

function applyToElement(element: Element) {
  if (element instanceof HTMLInputElement) {
    const type = (element.type || "text").toLowerCase();
    if (!TEXT_INPUT_TYPES.has(type)) return;

    if (!element.hasAttribute("autocomplete")) {
      element.setAttribute("autocomplete", type === "search" ? "off" : "off");
    }

    if (!element.hasAttribute("autocapitalize")) {
      element.setAttribute("autocapitalize", "none");
    }

    if (!element.hasAttribute("spellcheck")) {
      element.setAttribute("spellcheck", "false");
    }

    return;
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    if (!element.hasAttribute("autocomplete")) {
      element.setAttribute("autocomplete", "off");
    }

    if (!element.hasAttribute("spellcheck")) {
      element.setAttribute("spellcheck", "false");
    }
  }
}

export function applyAutofillMitigations(root: ParentNode) {
  root.querySelectorAll("input, textarea, select").forEach((element) => {
    applyToElement(element);
  });
}

export function observeAutofillMitigations(root: HTMLElement) {
  applyAutofillMitigations(root);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        applyToElement(node);
        applyAutofillMitigations(node);
      });
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}

import Observer from "@cocreate/observer";
import "@cocreate/element-prototype";

const selector =
	"[value-selector], [value-closest], [value-parent], [value-next], [value-previous], [value-document], [value-frame], [value-top]";

/**
 * Initializes elements with value-* attributes to enable dynamic value retrieval and setting.
 *
 * @param {HTMLElement|HTMLCollection|NodeList|Array<HTMLElement>} [element] - Optional element(s) to initialize. If not provided, initializes all matching elements in the document.
 */
async function init(element) {
	if (
		element &&
		!(element instanceof HTMLCollection) &&
		!(element instanceof NodeList) &&
		!Array.isArray(element)
	) {
		element = [element];
	} else if (!element) {
		element = document.querySelectorAll(selector);
	}

	for (let i = 0; i < element.length; i++) {
		initElement(element[i]);
	}
}

/**
 * Initializes a single element with value-* attributes.
 *
 * @param {HTMLElement} element - The element to initialize.
 */
function initElement(element) {
	let targets = element.queryElements();

	valueHandler(element, targets, true);
}

/**
 * Handles the retrieval and setting of values based on value-* attributes.
 *
 * @param {HTMLElement} element - The element to set the value on.
 * @param {object} targets - An object containing elements retrieved by queryElements().
 */
function valueHandler(element, targets = [], initialize) {
	let values = [];
	// TODO: consdier the potential of targets being an array of elements, should value be an array of the values?
	for (let i = 0; i < targets.length; i++) {
		if (!targets[i] || !targets[i].isConnected) {
			targets.splice(i, 1); // Remove the element
			i -= 1; // Adjust the index
			continue; // Skip to the next iteration
		}

		if (initialize) {
			// Remove existing listener (if any)
			targets[i].removeEventListener("input", elementValueHandler);

			// Add new listener
			targets[i].addEventListener("input", elementValueHandler);
		}

		values.push(targets[i].getValue());
	}

	if (!values.length) {
		return;
	} else if (values.length === 1) {
		values = values[0];
	}

	let attribute = element.getAttribute("value-attribute");
	if (attribute) {
		element.setAttribute(attribute, values);
	} else {
		element.setValue(values);
	}

	function elementValueHandler(e) {
		valueHandler(element, targets);
	}
}

init();

Observer.init({
	name: "CoCreateElementsValueAdded",
	observe: ["addedNodes"],
	selector: selector,
	callback: function (mutation) {
		init(mutation.target);
	}
});

Observer.init({
	name: "CoCreateElementsAttributes",
	observe: ["attributes"],
	attributeName: [
		"value-selector",
		"value-closest",
		"value-parent",
		"value-next",
		"value-previous",
		"value-document",
		"value-frame",
		"value-top"
	],
	callback: function (mutation) {
		let currentValue = mutation.target.getAttribute(mutation.attributeName);
		if (currentValue !== mutation.oldValue) {
			initElement(mutation.target);
		}
	}
});

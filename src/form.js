import Observer from "@cocreate/observer";
import { getAttributeNames, ObjectId } from "@cocreate/utils";
import Action from "@cocreate/actions";
import elementPrototype from "@cocreate/element-prototype";

/**
 * Initializes form elements. If no parameter is provided, or null is passed, it queries and initializes all form elements.
 * It can also initialize a single form element or an array of form elements.
 *
 * @param {(Element|Element[]|null)} [elements] - Optional. A single form element, an array of form elements, or null.
 *     - If null or omitted, the function queries and initializes all form elements.
 *     - If a single form element is provided, it initializes that element.
 *     - If an array of form elements is provided, each element in the array is initialized.
 */
function init(elements) {
	if (!elements) elements = document.querySelectorAll("form");
	else if (!Array.isArray(elements)) elements = [elements];

	for (let element of elements) {
		runObjectId(element);
		setAttribute(element);
		disableAutoFill(element);
		setValue(element);

		element.addEventListener("submit", function (event) {
			if (!element.hasAttribute("action")) {
				event.preventDefault();
			}
		});

		// Handle form reset event
		element.addEventListener("reset", function (event) {
			event.preventDefault(); // Prevent default reset
			reset({ form: event.target }); // Call custom reset logic
		});
	}
}

/**
 * @param form
 */
// TODO: runObjectId could potentially be removed and handled by element-prototype getAttribute $object_id
// Somthing to consider is that $object_id is not replaced by an _id causing getAttribute to return a new _id on each get
function runObjectId(form) {
	let elements = Array.from(form.querySelectorAll("[object='ObjectId()']"));

	if (form.getAttribute("object") === "ObjectId()") {
		elements.push(form);
	}
	for (let i = 0; i < elements.length; i++) {
		let array = elements[i].getAttribute("array");
		if (!array) continue;
		elements[i].setAttribute("object", ObjectId().toString());
	}
}

const formAttributes = [
	"organization_id",
	"host",
	"storage",
	"database",
	"array",
	"index",
	"object",
	"key"
];
const formAttributesSelector = formAttributes.map((attr) => `[${attr}]`).join(", ");

/**
 * @param form
 */
function setAttribute(form, elements) {
	if (!elements) elements = form.querySelectorAll(formAttributesSelector);

	for (let attribute of form.attributes) {
		if (!formAttributes.includes(attribute.name)) continue;

		for (let el of elements) {
			// Set the value of the attribute.
			// TODO: skip-attribute naming convention, perhaps skip by defualt if storage, database, array not the same and use attribute to apply for cases where one _id will be used across 2 arrays
			if ( !el.hasAttribute("skip-attribute") ) {
				el.setAttribute(attribute.name, attribute.value);
			}
		}
	}
}

/**
 * @param element
 */
function disableAutoFill(element) {
	// Clear the text area and set the autocomplete attribute to off.
	if (element.tagName == "TEXTAREA") {
		element.value = "";
		element.setAttribute("autocomplete", "off");
	}
	// Set the autocomplete attribute to off.
	if (!element.hasAttribute("autocomplete")) {
		element.setAttribute("autocomplete", "off");
	}
}

/**
 * @param form
 */
function reset(action) {
	let form = action.form;

	// Convert the form elements collection to an array
	const formElementsArray = Array.from(form.elements);

	// Query for additional elements with [object] or [key] attributes that are not already part of form controls
	const customElements = Array.from(
		form.querySelectorAll(
			"[object], [key]:not(input):not(select):not(textarea):not(button)"
		)
	);

	// Merge form elements and custom elements using the spread operator
	const allElements = [...formElementsArray, ...customElements];

	// Store the elements and their values in a map for restoration
	const elementStates = new Map();

	// Iterate over all elements and store their current state based on the 'reset' attribute
	for (const element of allElements) {
		if (["BUTTON", "FIELDSET"].includes(element.tagName)) continue;
		// Get the reset attribute value, if any
		const resetType = element.getAttribute("reset");
		if (
			element.hasAttribute("object") &&
			(!resetType || resetType === "object")
		)
			element.setAttribute("object", "");
		if (resetType === "false" || resetType === "object")
			elementStates.set(
				element,
				element.getValue() ||
					element.value ||
					element.getAttribute("value")
			);
		if (!resetType || resetType === "value") {
			if (element.contentEditable === "true") {
				element.innerHTML = "";
			} else {
				element.setValue("");
			}
		}
	}

	if (form.hasAttribute("object")) form.setAttribute("object", "");

	// Perform the default form reset
	form.reset();

	// Restore values based on the 'reset' attribute
	elementStates.forEach((value, element) => {
		element.setValue(value);
	});

	// Dispatch a custom reset event
	if (action.element) {
		action.element.dispatchEvent(
			new CustomEvent("reset", {
				detail: {}
			})
		);
	}
}

function setValue(form) {
	form.setValue = (value) => {
		if (typeof value !== "object") elementPrototype.setValue(form, value);
		else {
			const inputs = form.querySelectorAll("[name], [key]");
			inputs.forEach((element) => {
				const key =
					element.getAttribute("key") || element.getAttribute("name");
				if (value[key]) {
					element.setValue(value[key]);
				}
			});
		}
	};
}

Observer.init({
	name: "CoCreateForm",
	types: ["addedNodes"],
	selector: "form",
	callback: (mutation) => init(mutation.target)
});

Observer.init({
	name: "CoCreateForm",
	types: ["attributes"],
	attributeFilter: getAttributeNames([
		"organization_id",
		"host",
		"storage",
		"database",
		"array",
		"object",
		"index"
	]),
	selector: "form",
	callback: (mutation) =>
		mutation.target.tagName === "FORM" && setAttribute(mutation.target)
});

Observer.init({
	name: "CoCreateFormElements",
	types: ["addedNodes"],
	selector: formAttributesSelector,
	callback: function (mutation) {
		let form = mutation.target.form || mutation.target.closest("form");
		if (form) setAttribute(form, [mutation.target]);
	}
});

Action.init({
	name: "reset",
	endEvent: "reset",
	callback: (action) => {
		if (action.form) reset(action);
	}
});

init();

export { reset };

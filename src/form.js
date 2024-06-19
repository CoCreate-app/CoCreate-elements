import Observer from '@cocreate/observer';
import { getAttributeNames, ObjectId } from '@cocreate/utils';
import Action from '@cocreate/actions';
import '@cocreate/element-prototype';


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
    if (!elements)
        elements = document.querySelectorAll('form');
    else if (!Array.isArray(elements))
        elements = [elements]

    for (let element of elements) {
        Observer.init({
            name: 'CoCreateFormElements',
            observe: ['addedNodes'],
            target: '[storage], [database], [array], [index], [object], [key]',
            callback: function (mutation) {
                if (element == mutation.target.form)
                    setAttribute(element, [mutation.target])
            }
        });

        runObjectId(element);
        setAttribute(element);
        disableAutoFill(element);
        element.addEventListener('submit', function (event) {
            if (!element.hasAttribute('action')) {
                event.preventDefault();
            }
        });
    }
}

/**
* @param form
*/
function runObjectId(form) {
    let elements = form.querySelectorAll("[object='ObjectId()']")
    let arrays = []
    // Add a array to the array list
    for (let i = 0; i < elements.length; i++) {
        elements[i].setAttribute('object', '')
        let array = elements[i].getAttribute('array')
        // Add a array to the array list.
        if (array && !arrays.includes(array))
            arrays.push(array)
    }
    // Sets the object id for each array in the array.
    for (let i = 0; i < arrays.length; i++) {
        // TODO: needs access to setTypeValue
        setTypeValue(form, { array: arrays[i], object: [{ _id: ObjectId().toString() }] });
    }
}

/**
* @param form
*/
function setAttribute(form, elements) {
    if (!elements)
        elements = form.querySelectorAll('[storage], [database], [array], [index], [object], [key]');

    for (let attribute of form.attributes) {
        let variable = window.CoCreateConfig.attributes[attribute.name]

        // Set the attribute of all elements in the variable
        if (variable) {
            for (let el of elements) {
                // Set the value of the attribute.
                if (!el.getAttribute(attribute.name) && !el.hasAttribute('skip-attribute')) {
                    el.setAttribute(attribute.name, form.getAttribute(attribute.name));
                }
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
        element.setAttribute('autocomplete', "off");
    }
}

/**
* @param form
*/
function reset(form) {
    if (form.hasAttribute('object'))
        form.setAttribute('object', '');
    let formElements = new Map();
    for (let element of form) {
        formElements.set(element, '')
        // Set object attribute to object if it exists
        if (element.hasAttribute('object'))
            element.setAttribute('object', '');
        // If the element is a button and has a button with the same key, set the value to the value of the button.
        if (!['BUTTON'].includes(element.tagName))
            element.setValue('')
    }

    let elements = form.querySelectorAll('[object], [key]');
    for (let element of elements) {
        // Set the object id attribute of the element to the object id if it has not yet been set.
        if (!formElements.has(element)) {
            // Set object attribute to object if it exists
            if (element.hasAttribute('object'))
                element.setAttribute('object', '');
            element.setValue('')
        }
    }

    form.reset();
    // dispatch input event to rest filter??
    document.dispatchEvent(new CustomEvent('reset', {
        detail: {}
    }));
}

Observer.init({
    name: 'CoCreateForm',
    observe: ['addedNodes'],
    target: 'form',
    callback: mutation => init(mutation.target)
});

Observer.init({
    name: 'CoCreateForm',
    observe: ['attributes'],
    attributeName: getAttributeNames(['storage', 'database', 'array', 'object', 'index']),
    target: 'form',
    callback: mutation => mutation.target.tagName === "FORM" &&
        setAttribute(mutation.target)
});

Action.init({
    name: "reset",
    endEvent: "reset",
    callback: (action) => {
        if (action.form)
            reset(action.form);
    }
});

init();

export { reset };

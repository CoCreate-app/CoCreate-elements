import Observer from '@cocreate/observer';
import { getAttributeNames, ObjectId } from '@cocreate/utils';
import Action from '@cocreate/actions';
import '@cocreate/element-prototype';

/**
* @param elements
*/
function init(elements) {
    // Returns an array of elements.
    if (!elements)
        elements = document.querySelectorAll('form');
    // If elements is an array of elements returns an array of elements.
    else if (!Array.isArray(elements))
        elements = [elements]
    for (let element of elements) {
        runObjectId(element);
        setAttribute(element);
        disableAutoFill(element);
        // element.setData = () => { }
        // element.getData = () => getFormData(element)
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
        setTypeValue(form, { array: arrays[i], object: [{ _id: ObjectId() }] });
    }
}

/**
* @param form
*/
function setAttribute(form) {
    let elements = form.querySelectorAll('[key]');

    for (let attribute of form.attributes) {
        let variable = window.CoCreateConfig.attributes[attribute.name]

        // Set the attribute of all elements in the variable
        if (variable) {
            for (let el of elements) {
                // Set the value of the attribute.
                if (!el.getAttribute(attribute.name)) {
                    el.setAttribute(attribute.name, attribute.value);
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
* @param btn
*/
function reset(btn) {
    const form = btn.closest("form");
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
        reset(action.element);
    }
});

init();

export default { reset };

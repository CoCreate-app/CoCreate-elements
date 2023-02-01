import observer from '@cocreate/observer';
import '@cocreate/element-prototype';

// ToDo: actions="getValue", get-value-target, attribute get-value= selector or value compare to event components like toggle 

const valueEls = new Map();

function initGetValues() {
	var elements = document.querySelectorAll('[get-value], [get-value-closest]');
	initElements(elements);
}

function initElements(elements) {
	for (let element of elements)
		initElement(element);
	for(let valueEl of valueEls.keys())
		setValueByFind(valueEl);
}

function initElement(element, mutation) {
    let selector = element.getAttribute('get-value') || element.getAttribute('get-value-closest');
    if (!selector) return;
	if (/{{\s*([\w\W]+)\s*}}/g.test(selector)) return;
	
	let valueEl
	if (element.hasAttribute('get-value-closest'))
		valueEl = element.closest(selector);
	else
		valueEl = document.querySelector(selector);
	if (!valueEl) return;

	initEvents(valueEl, element, mutation);

	element.dispatchEvent(new Event("input", {
		"bubbles": true
	}));

}

function initEvents(valueEl, element, mutation){
	if (!valueEls.has(valueEl)) {
		valueEls.set(valueEl, [element]);

		valueEl.addEventListener('input', (e) => {
			setValueByFind(e.target);
		});
		
		valueEl.addEventListener('updated_by_fetch', (e) => {
			setValueByFind(e.target);
		});
	}
	else 
		valueEls.get(valueEl).push(element);

	// ToDo: check to see if creates any loops or un wanted save by input event
	if (mutation)
		mutation = [element]
	setValueByFind(valueEl, mutation)
}

function setValueByFind(valueEl, mutation) {
	let value = valueEl.getValue();
	if (!value) return;

	let elements = mutation || valueEls.get(valueEl);
	if (elements) {
		for(let element of elements){
			let key = element.getAttribute('get-value-key');
			if (key){
				key = `{{${key}}}`;
				const regex = new RegExp(key, "g");
				for (let attribute of element.attributes){
					let attrName = attribute.name;
					let attrValue = attribute.value;
					let setAttr = false;
					if (attrValue.includes(key)){
						attrValue = attrValue.replace(regex, value);
						setAttr = true;
					}
					if (attrName.includes(key)){
						element.removeAttribute(key);
						attrName = attrName.replace(regex, value);
						setAttr = true;
					}
					if (setAttr)
						element.setAttribute(attrName, attrValue);
				}
				let html = element.innerHTML;
				if (html.indexOf(key) !== -1){
					html = html.replace(regex, value);
					element.innerHTML = html;
				}
			}
			else
				element.setValue(value);
		}
	}
}

observer.init({
	name: 'get-value',
	observe: ['addedNodes'],
	target: '[get-value], [get-value-closest]',
	callback: function(mutation) {
		initElement(mutation.target, true);
	}
});

export { initGetValues };

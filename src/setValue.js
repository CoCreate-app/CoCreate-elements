import observer from '@cocreate/observer';
import CRUD from '@cocreate/crud-client';
import { queryDocumentSelectorAll } from '@cocreate/utils';
import '@cocreate/element-prototype';

let crud
if(CRUD && CRUD.default)
	crud = CRUD.default
else
	crud = CRUD

function initSetValues() {
	var elements = document.querySelectorAll('[set-value], [set-value-closest]');
	initElements(elements);
}

function initElements(elements) {
	for (let element of elements)
		initElement(element);
}

function initElement(element) {
	initEvents(element);
}

function initEvents(element){
	element.addEventListener('input', (e) => {
		setValueByFind(e.target);
	});
		
	element.addEventListener('updated_by_fetch', (e) => {
		setValueByFind(e.target);
	});

	setValueByFind(element);
}

const setValueMap = new Map();
function setValueByFind(element){
	let key = element.getAttribute('set-value-key');
	if (key)
		key = `{{${key}}}`;
	
	let value
	if(element.getValue)
		value = element.getValue();
	if (!value) return;

    let selector = element.getAttribute('set-value');
    if(!selector) return;
	let elements;
	if (element.hasAttribute('set-value-closest'))
		elements = [element.closest(selector)];
	else
		elements = queryDocumentSelectorAll(selector);

	for(let element of elements){
		if (key){
			if (setValueMap.has(element))
				key = setValueMap.get(element);
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
				if(setAttr)
					element.setAttribute(attrName, attrValue);
			}
			let html = element.innerHTML;
			if (html.indexOf(key) !== -1){
				html = html.replace(regex, value);
				element.innerHTML = html;
			}
			setValueMap.set(element, value)
		}
		else
			element.setValue(value);
	}
		
}

observer.init({
	name: 'set-value',
	observe: ['addedNodes'],
	target: '[get-value], [get-value-closest]',
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

export { initSetValues };

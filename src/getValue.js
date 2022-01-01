import observer from '@cocreate/observer';
import { setValue } from './setValue';

function initGetValues() {
	var elements = document.querySelectorAll('[get-value]');
	initElements(elements);
}

function initElements(elements) {
	for (let element of elements)
		initElement(element);
}

function initElement(element) {
    let selector = element.getAttribute('get-value');
    if(!selector) return;
	
	let valueEl = document.querySelector(selector);
	if(!valueEl) return;
	
	let value = getValue(valueEl);
	if (value)
		setValue(element, value);
	
	initEvents(valueEl, element);

	element.dispatchEvent(new Event("input", {
		"bubbles": true
	}));

}

const valueEls = new Map();
function initEvents(valueEl, element){
	if (!valueEls.has(valueEl)) 
		valueEls.set(valueEl, [element]);
	else {
		valueEls.get(valueEl).push(element);
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(valueEl.tagName)  || valueEl.contentEditable)
			valueEl.addEventListener('input', (e) => {
				setValueByFind(e.target);
			});
		
		valueEl.addEventListener('updated_by_fetch', (e) => {
			setValueByFind(e.target);
		});
	}
}

function setValueByFind(valueEl) {
	let value = getValue(valueEl);
	if (!value) return;
	let elements = valueEls.get(valueEl);
	
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
				if(setAttr)
					element.setAttribute(attrName, attrValue);
			}
			let html = element.innerHTML;
			if (html.indexOf(key) !== -1){
				html.replace(regex, value);
				element.innerHTML = html;
			}
		}
		else
			setValue(element, value);
	}
}

var getValue = (element) => {
	let value = element.value;
	let prefix = element.getAttribute('value-prefix') || "";
	let suffix = element.getAttribute('value-suffix') || "";

	if (element.type === "checkbox") {
		let el_name = element.getAttribute('name');
		let checkboxs = document.querySelectorAll(`input[type=checkbox][name='${el_name}']`);
		if (checkboxs.length > 1) {
			value = [];
			checkboxs.forEach(el => {
				if (el.checked) value.push(el.value);
			});
		}
		else {
			value = element.checked;
		}
	}
	else if (element.type === "number") {
		value = Number(value);
	}
	else if (element.type === "password") {
		value = __encryptPassword(value);
	}
	else if (element.tagName == "SELECT" && element.hasAttribute('multiple')) {
		let options = element.selectedOptions;
		value = [];
		for (let i = 0; i < options.length; i++) {
			value.push(options[i].value);
		}
	}
	else if (element.tagName == 'INPUT' || element.tagName == 'TEXTAREA' || element.tagName == 'SELECT') {
		value = element.value;
	}
	else if (element.tagName === 'IFRAME') {
		value = element.srcdoc;
	}
	else {
		value = element.innerHTML;
	}
	if (prefix || suffix)
		value = prefix + value + suffix;

	return value;
};

function __encryptPassword(str) {
	let encodedString = btoa(str);
	return encodedString;
}

observer.init({
	name: 'get-value',
	observe: ['addedNodes'],
	target: '[get-value]',
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

initGetValues();
export { getValue };

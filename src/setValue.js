import observer from '@cocreate/observer';
import crud from '@cocreate/crud-client';
import { getValue } from './getValue';

function initSetValues() {
	var elements = document.querySelectorAll('[set-value]');
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
}

const setValueMap = new Map();
function setValueByFind(element){
	let key = element.getAttribute('set-value-key');
	if (key)
		key = `{{${key}}}`;
	let value = element.getValue(element);
	if (!value) return;
    let selector = element.getAttribute('set-value');
    if(!selector) return;
	let elements = document.querySelectorAll(selector);
	
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
			setValue(element, value);
	}
		
}

var setValue = (el, value) => {
	if (value === null || value === undefined) return;
	
	if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA' || el.tagName == 'SELECT') {
		const {isCrdt} = crud.getAttr(el);
		if (isCrdt == "true" || el.type === 'file') return;

		if (el.type == 'checkbox') {
			if (value.includes(el.value)) {
				el.checked = true;
			}
			else {
				el.checked = false;
			}
		}
		else if (el.type === 'radio') {
			el.value == value ? el.checked = true : el.checked = false;
		}
		else if (el.type === 'password') {
			el.value = __decryptPassword(value);
		}
		else if (el.tagName == "SELECT" && el.hasAttribute('multiple') && Array.isArray(value)) {
			let options = el.options;
			for (let i = 0; i < options.length; i++) {
				if (value.includes(options[i].value)) {
					options[i].selected = "selected";
				}
			}
		}
		else
			el.value = value;
		dispatchEvents(el)
	}
	else if (el.tagName === 'IMG' || el.tagName === 'SOURCE')
		el.src = value;
	
	else if (el.tagName === 'IFRAME') {
		el.srcdoc = value;
		// el.contentDocument.documentElement.innerHTML = value;
		if(navigator.userAgent.toLowerCase().indexOf('firefox') > -1){
		     // Do Firefox-related activities
		}
		else
		el.onload = function(e) {
			el.removeAttribute('srcdoc');
		};
	}
	
	else if (el.tagName === 'DIV') {
		if (el.hasAttribute("value")) {
			el.setAttribute("value", value);
		}

		if (el.classList.contains('domEditor')) {
			if (el.getAttribute('data-domEditor') == "replace") {
				let newElement = document.createElement("div");
				newElement.innerHTML = value;
				let parentNode = el.parentNode;
				if (parentNode) {
					if (newElement.children[0]) {
						parentNode.replaceChild(newElement.children[0], el);
					}
					else {
						parentNode.replaceChild(newElement, el);
					}
				}
			}
			else {
				el.innerHTML = value;
			}
		}
	}
	
	else if (el.tagName === 'SCRIPT'){
		setScript(el, value);
	}
	else {
		if (el.hasAttribute('contenteditable') && el == document.activeElement) return;
		
		el.innerHTML = value;
		if (el.hasAttribute("value")) {
			el.setAttribute("value", value);
		}
	}
	if (el.getAttribute('contenteditable'))
		dispatchEvents(el);
		
	if (el.tagName == 'HEAD' || el.tagName == 'BODY') {
		el.removeAttribute('collection');
		el.removeAttribute('document_id');
		el.removeAttribute('pass_id');

		let scripts = el.querySelectorAll('script');
		for (let script of scripts) {
			setScript(script)
		}
	}
};

function setScript(script, value) {
	let newScript = document.createElement('script');
	newScript.attributes = script.attributes;
	newScript.innerHTML = script.innerHTML;
	if (value) {
		if (script.hasAttribute("src"))
			newScript.src = value;
		else
			newScript.innerHTML = value;
	}
	script.replaceWith(newScript);
}

function __decryptPassword(str) {
	if (!str) return "";
	let decode_str = atob(str);
	return decode_str;
}

function dispatchEvents(el) {
	let inputEvent = new CustomEvent('input', {
		bubbles: true,
		detail: {
			skip: true
		},
	});
	Object.defineProperty(inputEvent, 'target', {
		writable: false,
		value: el
	});
	el.dispatchEvent(inputEvent);
	
	let changeEvent = new CustomEvent('change', {
		bubbles: true,
		detail: {
			skip: true
		},
	});
	Object.defineProperty(changeEvent, 'target', {
		writable: false,
		value: el
	});
	el.dispatchEvent(changeEvent);
}

observer.init({
	name: 'set-value',
	observe: ['addedNodes'],
	target: '[set-value]',
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

export { initSetValues, setValue };

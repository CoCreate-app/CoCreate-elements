import crud from '@cocreate/crud-client';

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
			value = __decryptPassword(value);
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

		// ToDo: replace with custom event system
		el.dispatchEvent(new CustomEvent('CoCreateInput-setvalue', {
			eventType: 'rendered'
		}));
	}
	else if (el.tagName === 'IMG' || el.tagName === 'SOURCE')
		el.src = value;
	
	else if (el.tagName === 'IFRAME') {
		el.srcdoc = value;
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
		el.innerHTML = value;
		if (el.hasAttribute("value")) {
			el.setAttribute("value", value);
		}
	}

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

export {setValue};

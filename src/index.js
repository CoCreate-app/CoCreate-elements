import observer from '@cocreate/observer';
import action from '@cocreate/action';
import crud from '@cocreate/crud-client';

const CoCreateElements = {

	selector: "[collection][document_id][name]:not(cocreate-select, link)",

	init: function() {
		let elements = document.querySelectorAll(this.selector);
		this.__initSocket();
		this.initElements(elements);
		this.__initEvents(elements);
	},

	initElements: async function(elements) {
		const requests = this.__getReqeust(elements)
		if (requests && requests.size > 0) {
			for (let [key, {collection, document_id}] of requests) {
				requests.delete(key);
				var responseData = await crud.readDocument({
					collection: collection,
					document_id: document_id,
				});
				this.setData(elements, responseData);
			}
		}
	},
	
	setData: function(elements, data) {
		let isRendered = false;
		if (!data) return;
		if (!elements) {
			let collection = data.collection;
			let document_id = data.document_id;
			let selector = `[collection='${collection}'][document_id='${document_id}']:not(cocreate-select, link)`;
			elements = document.querySelectorAll(selector);
		}
		let encodeData = crud.encodeObject(data.data);

		elements.forEach((el) => {
			const { collection, document_id, name, isRead, isUpdate, isCrdt } = crud.getAttr(el);
			if (el.hasAttribute('actions')) return;
			if (isRead == "false" || isUpdate == "false") return;
			let isEditable = el.hasAttribute('contenteditable');
			if (data['collection'] == collection && data['document_id'] == document_id && !isEditable) {
				const value = encodeData[name]
				if (value === null || value === undefined) return;
				
				if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA' || el.tagName == 'SELECT') {
					this.setValue(el, value); 
					return;
				}
				if (el.tagName === 'IMG' || el.tagName === 'SOURCE')
					el.src = value;
				
				else if (el.tagName === 'IFRAME') {
					el.srcdoc = value;
					let iframe = el;
					console.log('dnd loaded trigger event')
					el.onload = function(e) {
						iframe.removeAttribute('srcdoc');
							let event = new CustomEvent('CoCreateElements-rendered', {
							detail: {window: iframe.contentWindow}
						})
						window.parent.dispatchEvent(event);
					}
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
					this.setScript(el, value)
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
						this.setScript(script)
					}
				}

				isRendered = true
				el.value = value;
			}
		})

		if (isRendered) {
			// ToDo: Replace with custom event
			const event = new CustomEvent('CoCreateElements-rendered', {
				eventType: 'rendered',
				detail: {
					data: data
				}
			})

			document.dispatchEvent(event)
		}
	},
	
	setScript: function(script, value) {
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
	},
	
	setValue: function(input, value) {
		const {name, isCrdt} = crud.getAttr(input);
		if (isCrdt == "true" || input.type === 'file') return;

		if (input.type == 'checkbox') {
			if (Array.isArray(value)) {
				let checkboxs = document.querySelectorAll(`input[type=checkbox][name='${name}']`);
				checkboxs.forEach(el => {
					if (value.includes(el.value)) {
						el.checked = true;
					}
				});
				return;
			}
			else {
				input.checked = true;
			}
		}
		else if (input.type === 'radio') {
			input.value == value ? input.checked = true : input.checked = false;
		}
		else if (input.type === 'password') {
			value = this.__decryptPassword(value);
		}

		input.value = value;

		let inputEvent = new CustomEvent('input', {
			bubbles: true,
			detail: {
				skip: true
			},
		});
		Object.defineProperty(inputEvent, 'target', {
			writable: false,
			value: input
		});
		input.dispatchEvent(inputEvent);
		
		let changeEvent = new CustomEvent('change', {
			bubbles: true,
			detail: {
				skip: true
			},
		});
		Object.defineProperty(changeEvent, 'target', {
			writable: false,
			value: input
		});
		input.dispatchEvent(changeEvent);

		if (input.tagName == "SELECT" && input.hasAttribute('multiple') && Array.isArray(value)) {
			let options = input.options;
			for (let i = 0; i < options.length; i++) {
				if (value.includes(options[i].value)) {
					options[i].selected = "selected";
				}
			}
		}

		// ToDo: replace with custom event system
		input.dispatchEvent(new CustomEvent('CoCreateInput-setvalue', {
			eventType: 'rendered'
		}));
	},
	
	getValue: function(input) {
		let value = input.value;

		let prefix = input.getAttribute('value-prefix') || "";
		let suffix = input.getAttribute('value-suffix') || "";

		if (input.type === "checkbox") {
			let el_name = input.getAttribute('name');
			let checkboxs = document.querySelectorAll(`input[type=checkbox][name='${el_name}']`);
			if (checkboxs.length > 1) {
				value = [];
				checkboxs.forEach(el => {
					if (el.checked) value.push(el.value);
				});
			}
			else {
				value = input.checked;
			}
		}
		else if (input.type === "number") {
			value = Number(value);
		}
		else if (input.type === "password") {
			value = this.__encryptPassword(value);
		}

		if (typeof value == "string") {
			value = prefix + value + suffix;
		}

		if (input.tagName == "SELECT" && input.hasAttribute('multiple')) {
			let options = input.selectedOptions;
			value = [];
			for (let i = 0; i < options.length; i++) {
				value.push(options[i].value);
			}
		}

		return value;
	},
	
	// Gets all Collection and document_id to group and create fewer requests
	__getReqeust: function(elements) {

		let requests = new Map();

		elements.forEach((el) => {
			// if rendered in server side skip 
			if (el.hasAttribute('rendered')) {
				el.removeAttribute('rendered')
				return;
			}
			
			if (el.closest('.template')) return;

			const { collection, document_id, name, isRead } = crud.getAttr(el)
			if (!collection || !document_id|| !name || isRead == "false") return;
			if (!crud.checkAttrValue(collection) || !crud.checkAttrValue(document_id) || !crud.checkAttrValue(name)) return;
			 
			requests.set(`${collection}${document_id}`, {collection, document_id})
		})
		return requests;
	},
	
	save: async function(element) {
		// if (!element.classList.contains('domEditor')) {
		// 	return;
		// }
		
		let value;
		let isFlat;
		if (element.tagName == 'INPUT' || element.tagName == 'TEXTAREA' || element.tagName == 'SELECT') {
			isFlat = !this.__checkMultiple(element);
			value = this.getValue(element)
		}
		else if (element.tagName === 'IFRAME') {
			value = element.srcdoc;
		}
		else {
			value = element.innerHTML;
			element.value = value;
		}
		await crud.save(element, value, isFlat)
	},
	
	__initSocket: function() {
		const self = this;
		crud.listen('updateDocument', function(data) {
			self.setData(null, data);
		})
	},
	
	__initEvents: function(elements) {
		for (let el of elements){
			if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA' || el.tagName == 'SELECT' || el.hasAttribute('contenteditable')) {
		
				const self = this;
	
				el.addEventListener('input', function(e) {
					const {document_id, isRealtime, isCrdt} = crud.getAttr(el);
					if (isCrdt == "true" && document_id || isRealtime == "false") return;
					if (e.detail.skip === true) return;
					self.save(this);
				});
		
				el.addEventListener('change', function(e) {
					if (this.tagName == 'SELECT') {
						const {isRealtime, isSave, isUpdate} = crud.getAttr(el);
						if (isRealtime == "false" || isSave == "false" || isUpdate == "false") return;
						self.save(this);
					}
				});
			}
		}

	},
	
	__checkMultiple: function(el) {
		if (el.tagName == 'INPUT' && el.getAttribute('type') == 'checkbox') {
			return true;
		}

		if (el.tagName == "SELECT" && el.hasAttribute('multiple')) {
			return true;
		}
		return false;
	},

	__encryptPassword: function(str) {
		var encodedString = btoa(str);
		return encodedString;
	},

	__decryptPassword: function(str) {
		if (!str) {
			return "";
		}

		var decode_str = atob(str);
		return decode_str;
	},
}

CoCreateElements.init();

observer.init({
	name: 'CoCreateElementsChildList',
	observe: ['childList'],
	target: CoCreateElements.selector,
	callback: function(mutation) {
		CoCreateElements.initElements(mutation.addedNodes)
	}
})

observer.init({
	name: 'CoCreateElementsAttributes',
	observe: ['attributes'],
	attributeName: ['collection', 'document_id', 'name'],
	target: CoCreateElements.selector,
	callback: function(mutation) {
		let {collection, document_id, name} = crud.getAttr(mutation.target)
		if(collection && document_id && name)
			CoCreateElements.initElements([mutation.target])
	}
});

action.init({
	action: "saveHtml",
	endEvent: "changed-element",
	callback: (btn, data) => {
		let form = btn.closet('form')
		CoCreateElements.save(form)
	},
});

export default CoCreateElements;

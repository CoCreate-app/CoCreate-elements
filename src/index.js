import observer from '@cocreate/observer';
import action from '@cocreate/action';
import crud from '@cocreate/crud-client';
import {setValue} from './setValue';
import {getValue} from './getValue';

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
			let isEditable = el.getAttribute('contenteditable');
			
			if (data['collection'] == collection && data['document_id'] == document_id && !isEditable) {
				const value = encodeData[name]
				setValue(el, value)

				isRendered = true;
			}
		});

		if (isRendered) {
			// ToDo: Replace with custom event
			const event = new CustomEvent('CoCreateElements-rendered', {
				eventType: 'rendered',
				detail: {
					data: data
				}
			});

			document.dispatchEvent(event);
		}
	},
	
	getValue: function(element) {
		let value = getValue(element)
		let isFlat = false;
		if (element.tagName == "INPUT" && element.type === "checkbox" || element.tagName == "SELECT" && element.hasAttribute('multiple'))
			isFlat = true
		return {value, isFlat};
	},
	
	save: async function(element) {
		let	{value, isFlat} = this.getValue(element);
		await crud.save(element, value, isFlat);
	},

	// Gets all Collection and document_id to group and create fewer requests
	__getReqeust: function(elements) {
		let requests = new Map();
		elements.forEach((el) => {
			
			if (el.tagName != 'DIV' || el.classList.contains('domEditor') || el.hasAttribute('contenteditable')){
				el.getValue = getValue; 
				el.setValue = setValue; 
			}
			// if rendered in server side skip 
			if (el.hasAttribute('rendered')) {
				el.removeAttribute('rendered');
				return;
			}
			
			if (el.closest('.template')) return;

			const { collection, document_id, name, isRead } = crud.getAttr(el);
			if (!collection || !document_id|| !name || isRead == "false") return;
			if (!crud.checkAttrValue(collection) || !crud.checkAttrValue(document_id) || !crud.checkAttrValue(name)) return;
			 
			requests.set(`${collection}${document_id}`, {collection, document_id});
		});
		return requests;
	},
	
	__initSocket: function() {
		const self = this;
		crud.listen('updateDocument', function(data) {
			self.setData(null, data);
		});
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
						if (isRealtime == "false" || isSave == "false" || isUpdate == "false")	return;
						self.save(this);
					}
				});
			}
		}
	}
};

CoCreateElements.init();

observer.init({
	name: 'CoCreateElementsChildList',
	observe: ['childList'],
	target: CoCreateElements.selector,
	callback: function(mutation) {
		CoCreateElements.initElements(mutation.addedNodes);
	}
});

observer.init({
	name: 'CoCreateElementsAttributes',
	observe: ['attributes'],
	attributeName: ['collection', 'document_id', 'name'],
	target: CoCreateElements.selector,
	callback: function(mutation) {
		let {collection, document_id, name} = crud.getAttr(mutation.target);
		if(collection && document_id && name)
			CoCreateElements.initElements([mutation.target]);
	}
});

action.init({
	action: "saveHtml",
	endEvent: "changed-element",
	callback: (btn, data) => {
		let form = btn.closet('form');
		CoCreateElements.save(form);
	},
});

export default CoCreateElements;

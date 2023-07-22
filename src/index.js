import Observer from '@cocreate/observer';
import Actions from '@cocreate/actions';
import CRUD from '@cocreate/crud-client';
import { dotNotationToObject, queryData, sortData } from '@cocreate/utils';
import '@cocreate/filter';
import '@cocreate/render';
import '@cocreate/element-prototype';
import './fetchSrc';


const selector = "[storage], [database], [collection]:not(cocreate-select, link)";
const elements = new Map();
const keys = new Map();
const debounce = new Map();

function init(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    else if (!element) {
        element = document.querySelectorAll(selector)
        initSocket();
    }

    let dataObjects = new Map();
    for (let i = 0; i < element.length; i++) {
        if (elements.has(element[i]))
            continue

        let data = initElement(element[i]);
        if (data) {
            let { key, object } = getKey(data)
            if (keys.has(key))
                keys.get(key).elements.set(element[i], '')
            else
                keys.set(key, { elements: new Map([[element[i], '']]), data, object });
            elements.set(element[i], key)
            dataObjects.set(key, data)
        }
    }

    if (dataObjects && dataObjects.size > 0) {
        for (let key of dataObjects.keys()) {
            let { elements, data } = keys.get(key)
            read(Array.from(elements.keys()), data, key);
        }
    }
}

function initElement(el) {
    initEvents(el);
    elements.set(el, '')

    // if (el.closest('.template')) return;

    const { collection, document_id, isRead, name } = CRUD.getAttributes(el);

    let data = CRUD.getObject(el);

    if (el.getFilter) {
        el.setFilter = (filter) => {
            data.filter = filter
            let { key, object } = getKey(data)
            if (keys.has(key))
                keys.get(key).elements.set(el, '')
            else
                keys.set(key, { elements: new Map([[el, '']]), data, object });
            elements.set(el, key)

            // remove(el)
            // init([el]);
            read(el, data, key)
        }
        data.filter = el.getFilter();
    } else {
        // TODO: Update to support other crudTypes
        if (!collection || !name) return;

        if (document_id)
            if (!document_id.match(/^[0-9a-fA-F]{24}$/)) return;
        if (!CRUD.checkValue(collection) || !CRUD.checkValue(name)) return;
    }

    if (isRead == 'false') return;
    if (!document_id && !data.filter) return;

    return data;
}

function initEvents(element) {
    if (!elements.has(element)) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
            || element.hasAttribute('contenteditable')
            || element.contenteditable) {
            element.addEventListener('input', function (e) {
                const { document_id, name, isRealtime, isCrdt } = CRUD.getAttributes(element);
                if (isCrdt == "true" && document_id && document_id != 'pending' || isRealtime == "false" || name == "_id") return;
                if (document_id && e.detail && e.detail.skip == true) return;
                save(element);
            });
        }
    }
}

async function read(element, data, key) {
    let delayTimer = debounce.get(key)
    clearTimeout(delayTimer);
    delayTimer = setTimeout(function () {
        debounce.delete(key)
        if (data.type === 'name')
            data.type = 'document'
        let action = 'read' + data.type.charAt(0).toUpperCase() + data.type.slice(1)
        if (['readDatabase', 'readCollection', 'readIndex', 'readDocument'].includes(action)) {
            CRUD[action](data).then((data) => {
                setData(element, data);
            })
        } else if (data[data.type]) {
            setData(element, data);
        }
    }, 500);
    debounce.set(key, delayTimer)
}

function setData(element, data, action) {
    if (!element) {
        element = []

        let matchingKeys = findMatchingKeys(data)
        for (let i = 0; i < matchingKeys.length; i++) {
            let matchingElements = keys.get(matchingKeys[i])
            if (matchingElements && matchingElements.elements && matchingElements.elements.size)
                element.push(...matchingElements.elements.keys())
        }

        if (!element.length) return
    }

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]


    let type = data.type
    if (!type && action) {
        type = action.match(/[A-Z][a-z]+/g);
        type = type[0].toLowerCase()

    } else if (type == 'name')
        type = 'document'

    for (let el of element) {
        // if rendered in server side skip 
        if (el.hasAttribute('rendered')) {
            el.removeAttribute('rendered');
            return;
        }

        if (!data[type] || !data[type].length)
            continue;

        const { name, isRead, isUpdate, isCrdt } = CRUD.getAttributes(el);
        // TODO: Update to support other crudTypes
        if (name) {
            // TODO: remove class domEditor as all elements will have value refrenced only certain types of elements actually get rendered
            if (el.hasAttribute('actions') || el.tagName === 'DIV' && !el.classList.contains('domEditor')) continue;
            if (isRead == "false" || isUpdate == "false" || isCrdt == "true") continue;

            // if (data.document[0]['collection'] == collection && data.document[0]['_id'] == document_id) {
            let value = CRUD.getValueFromObject(data[type][0], name);
            el.setValue(value);
            // }
        } else {
            filterData(el, data, type, action)
        }

    }
}

function filterData(element, data, type, action) {
    if (!element)
        return;

    let name = element.getAttribute('name');

    if (name) {
        if (!data.type) return
        if (Array.isArray(data[type])) {
            let Data = []
            for (let doc of data[type]) {
                if (doc[name]) {
                    if (Array.isArray(doc[name]))
                        Data.push(...doc[name])
                    else
                        Data.push(doc[name])
                }
            }
            let data = Data
        } else {
            data = { [name]: data[type][name] }
        }
    }

    if (element.getFilter && action && !action.startsWith('read')) {
        checkFilters(element, data, type, action)
    } else if (data)
        element.setValue(data);

    // render({ element, data, key: type });
    const evt = new CustomEvent('fetchedData', { bubbles: true });
    element.dispatchEvent(evt);
}

function checkFilters(element, data, type, action) {
    let Data = element.getValue()
    if (!Data) return

    let newData
    if (type) {
        Data = Data[type]
        newData = data[type]
    } else
        newData = data

    let filter = element.getFilter()
    if (filter && filter.query)
        newData = queryData(newData, filter.query)
    if (!newData.length)
        return

    if (Array.isArray(Data)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, Data, newData[i], type, filter, action)
            }
        } else {
            checkIndex(element, data, Data, newData, type, filter, action)
        }
    } else {
        let primaryKey
        if (type === 'document') {
            primaryKey = '_id';
        } else {
            primaryKey = 'name';
        }

        if (Data[primaryKey] === newData[primaryKey]) {
            Data = dotNotationToObject(newData, Data)
        }
        element.setValue(data);
    }
}

function checkIndex(element, data, Data, newData, type, filter, action) {
    let index
    if (type === 'document') {
        index = Data.findIndex(obj => obj._id === newData._id);
    } else {
        index = Data.findIndex(obj => obj.name === newData.name);
    }

    if (!data.filter)
        data.filter = {}

    if (action.startsWith('delete')) {
        if (!index && index !== 0)
            return
        data.filter.remove = true
    } else {
        if (!index && index !== 0) {
            data.filter.create = true
            Data.push(newData)
        } else {
            data.filter.update = true
            data.filter.currentIndex = index
            Data[index] = dotNotationToObject(newData, Data[index])
        }

        if (filter && filter.sort) {
            newData.isNewData = true
            Data = sortData(Data, filter.sort)
            index = Data.findIndex(obj => obj.isNewData);
        }

        if (index >= 0) {
            if (data.filter.currentIndex === index)
                delete data.filter.currentIndex
            data.filter.index = index
            element.setValue(data);
        }

    }
}

function getKey(data) {
    let key = {};
    let attributes = ["storage", "database", "collection", "index", "document", 'filter'];

    for (let attribute of attributes) {
        let value = data[attribute];
        if (value) {
            if (Array.isArray(value)) {
                key[attribute] = [...value];
                if (typeof value[0] === 'string')
                    key[attribute].sort(); // Sort the values alphabetically
            } else {
                key[attribute] = value;
            }
        }
    }

    const object = Object.fromEntries(Object.entries(key).sort(([a], [b]) => a.localeCompare(b)));
    key = JSON.stringify(object);

    return { key, object };
}

function findMatchingKeys(data) {
    const matchingKeyStrings = [];
    const targetKeys = ["storage", "database", "collection", "index", "document", 'filter'];

    for (const [keyString, sortedKey] of keys.entries()) {
        let hasMatch = true;

        for (const key of targetKeys) {
            if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (Array.isArray(sortedKey.data[key]) && Array.isArray(data[key])) {
                    // if key is document check _id
                    const matches = sortedKey.data[key].some(value => {
                        if (key === 'document') {
                            return data[key].some(obj => obj._id === value._id);
                        } else {
                            return data[key].includes(value)
                        }
                    });
                    if (!matches) {
                        hasMatch = false;
                        break;
                    }
                } else if (sortedKey.data[key] !== data[key]) {
                    hasMatch = false;
                    break;
                }
            }
        }

        if (hasMatch) {
            matchingKeyStrings.push(keyString);
        }
    }

    return matchingKeyStrings;
}

async function save(element) {
    let value = element.getValue();
    CRUD.save(element, value);
}

async function remove(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    for (let i = 0; i < element.length; i++) {
        let key = elements.get(element[i])
        if (key) {
            let els = keys.get(key).elements
            els.delete(element[i])
            elements.delete(key)
            debounce.delete(element[i])
        }
    }
}

function initSocket() {
    const array = ['create', 'update', 'delete'];
    const attributes = ["storage", "database", "collection", "index", "document", 'filter'];

    for (let i = 0; i < array.length; i++) {
        const actionPrefix = array[i];

        for (let j = 0; j < attributes.length; j++) {
            const attribute = attributes[j];
            const capitalizedAttribute = attribute.charAt(0).toUpperCase() + attribute.slice(1);
            const action = actionPrefix + capitalizedAttribute;

            CRUD.listen(action, function (data) {
                setData(null, data, action);
            });
        }
    }

    CRUD.listen('sync', function (data) {
        setData(null, data, action);
    });

}

function initDndEvents() {
    window.addEventListener('dndsuccess', function (e) {
        const { draggedEl, draggedFrom, droppedEl, droppedIn, position } = e.detail;

        if (!draggedFrom || !droppedIn) return

        if (!draggedFrom.isSameNode(droppedIn)) {
            updateDocuments(draggedEl, draggedFrom);
            updateDocuments(droppedEl, droppedIn, position);
        } else {
            updateDocuments(droppedEl, droppedIn, position);
        }

    });
}

// update documents
function updateDocuments(draggedEl, draggedFrom, droppedEl, droppedIn, position) {
    // TODO: update crud, delete crud and add to new location 
    // if dropped el in a different storage, database, collection updated
    // if dnd clone do not delete dragged crud,  just add to dropped crud

    // data.filter = element.getFilter();
    let data, index, newData
    if (draggedEl) {
        // remove item using crud
        data = draggedFrom.getValue() // data should be object from crud read so we can move
        newData = CRUD.getObject(draggedFrom)
    }

    if (droppedEl) {
        data = droppedIn.getValue() // data should be object from crud read so we can move
        newData = CRUD.getObject(droppedIn)
    }

    let object = {}
    let query = data.filter.query
    if (query && query.length) {
        for (let i = 0; i < query.length; i++) {
            if (query.operator === "$eq")
                object[query.name] = query.value
            if (query.operator === "$ne")
                object[query.name] = query.value
        }
    }

    let sortName, sortDirection
    let sort = data.filter.sort
    if (sort && sort.length) {
        // for (let i = 0; i < sort.length; i++) {
        for (let i = sort.length - 1; i >= 0; i--) {
            if (typeof data[sort.name] === 'number') {
                sortName = sort.name
                sortDirection = sort.direction
                break
            }
        }
    }

    if (sortName) {
        newData[newData.type] = []
        if (draggedEl && draggedFrom) {
            // could require performing a delete crud. how to dertimine if updating or deleting
            // even a field name should be deleteable. like the concept of defining a key as undefined for deletion 
            const nodeList = draggedFrom.querySelectorAll('[render-clone]');
            const arrayFromNodeList = Array.from(nodeList);
            index = arrayFromNodeList.indexOf(draggedEl);

            for (let i = 0; i < nodeListArray.length; i++) {
                if (i > index) {
                    let previousData = data[data.type][index]
                    object[sortName] = i - 1
                    newData[newData.type].push({ ...previousData, ...object })
                }
            }
        } else if (droppedEl && droppedIn) {
            const nodeList = droppedIn.querySelectorAll('[render-clone]');
            const nodeListArray = Array.from(nodeList);
            index = nodeListArray.indexOf(droppedEl);
            if (position === 'afterend')
                index += 1

            for (let i = 0; i < nodeListArray.length; i++) {
                if (i > index) {
                    let previousData = data[data.type][index]
                    object[sortName] = i + 1
                    newData[newData.type].push({ ...previousData, ...object })
                }
            }
        }
    } else {
        newData[newData.type] = [{ ...data[data.type][index], ...object }]
    }

    if (newData[newData.type].length) {
        if (CRUD)
            CRUD.updateDocument(newData)
        else
            console.log('dnd reordered data set as crud is unavailable')
    }
}


//TODO: needs to updated in order to match new system
function __deleteDocumentsAction(btn) {
    const collection = btn.getAttribute('collection');
    if (checkValue(collection)) {
        const template_id = btn.getAttribute('template_id');
        if (!template_id) return;

        let _ids = []
        const selectedEls = document.querySelectorAll(`.selected[templateid="${template_id}"]`);
        for (let i = 0; i < selectedEls.length; i++) {
            const _id = selectedEls[i].getAttribute('document_id');
            if (checkValue(_id))
                _ids.push({ _id })
        }

        if (_ids.length > 0 && crud) {
            CRUD.deleteDocument({
                collection,
                document: _ids
            }).then(() => {
                document.dispatchEvent(new CustomEvent('deletedDocuments', {
                    detail: {}
                }));
            })
        }

    }
}

Observer.init({
    name: 'CoCreateElementsChildList',
    observe: ['childList'],
    target: selector,
    callback: function (mutation) {
        init(mutation.addedNodes);
    }
});

Observer.init({
    name: 'CoCreateElementsRemovedNodes',
    observe: ['removedNodes'],
    target: selector,
    callback: function (mutation) {
        remove(mutation.target)
    }
});

Observer.init({
    name: 'CoCreateElementsAttributes',
    observe: ['attributes'],
    attributeName: CRUD.getAttributeNames(['storage', 'database', 'collection', 'document_id', 'name']),
    target: selector,
    callback: function (mutation) {
        remove(mutation.target)
        init([mutation.target]);
    }
});

Actions.init(
    {
        name: "saveHtml",
        endEvent: "changed-element",
        callback: (data) => {
            let form = data.element.closet('form');
            save(form);
        },
    },
    {
        name: "deleteDocuments",
        endEvent: "deletedDocuments",
        callback: (data) => {
            __deleteDocumentsAction(data.element);
        }
    }
);

init();

export default { init, save, elements, keys, debounce };

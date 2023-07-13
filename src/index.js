import Observer from '@cocreate/observer';
import Actions from '@cocreate/actions';
import CRUD from '@cocreate/crud-client';
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
            let matchingElements = elements.get(matchingKeys[i])
            if (matchingElements)
                element.push(...matchingElements)
        }

        if (!element) return
    }

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]


    let type = data.type
    if (type == 'name')
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
            filterData(el, data, data.type)
        }

    }
}

function filterData(element, data, type) {
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

        if (element.getFilter) {
            let filter = element.getFilter()
            if (filter && filter.query)
                data = queryData(data, filter.query)
            if (data) {
                // apply sort to see what position the data is in
                let index = getDataIndex(element, data)
                if (index === null)
                    return
                else if (index === 0 || index < count) {
                    data.filter.index = index
                } else if (index) {
                    let renderedNode = ""
                    if (renderedNode)
                        renderedNode.remove()
                    return
                }
            }
        }
    }

    if (data)
        element.setValue(data);

    // render({ element, data, key: type });
    const evt = new CustomEvent('fetchedData', { bubbles: true });
    element.dispatchEvent(evt);
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
            if (data.hasOwnProperty(key) && sortedKey.hasOwnProperty(key)) {
                if (Array.isArray(sortedKey[key]) && Array.isArray(data[key])) {
                    const matches = sortedKey[key].some(value => data[key].includes(value));
                    if (!matches) {
                        hasMatch = false;
                        break;
                    }
                } else if (sortedKey[key] !== data[key]) {
                    hasMatch = false;
                    break;
                }
            } else {
                hasMatch = false;
                break;
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
        const { draggedEl, droppedEl, position } = e.detail;

        let data = getDndTemplates(draggedEl, droppedEl, position)

        if (data.draggedFrom && data.droppedIn) {
            if (!data.draggedFrom.isSameNode(data.droppedIn)) {
                updateDocuments(data.draggedFrom);
                updateDocuments(data.droppedIn);
            } else {
                updateDocuments(data.droppedIn);
            }
        }

    });
}

function getDndTemplates(draggedEl, droppedEl, position) {
    let draggedFrom = draggedEl.closest('[render-selector]')
    let droppedIn = droppedEl.closest('[render-selector]')
    let draggedEid = draggedEl.getAttribute('eid')
    let droppedEid = droppedEl.getAttribute('eid')
    let index

    if (droppedEl) {
        if (droppedEid) {
            const children = droppedEl.parentElement.children;
            for (let i = 0; i < children.length; i++) {
                if (children[i].getAttribute('eid') === droppedEid) {
                    if (position == 'afterend')
                        index = i + 1
                    else
                        index = i
                    break;
                }
            }
        } else
            index = 0
    }
    return {
        draggedFrom,
        droppedIn, // wrapper
        draggedEl,
        droppedEl,
        draggedEid, // To get draggedEl
        droppedEid, // To get droppedEl
        index
    }
}

function setDndTemplates({ draggedFrom, droppedIn, draggedEl, droppedEl, draggedEid, droppedEid, index }) {
    if (draggedFrom && droppedIn) {
        if (!draggedEl) {
            draggedEl = draggedFrom.querySelector(`[eid='${draggedEid}']`);
            if (!draggedEl)
                draggedEl = droppedIn.querySelector(`[eid='${draggedEid}']`);
        }

        let data, type = 'document';
        if (draggedEl) {
            if (draggedFrom !== droppedIn) {
                if (CoCreate && CoCreate.render)
                    data = CoCreate.render.rederedNodes.get(draggedEl)
                else
                    data = {}

                dropItem.renderedElements.set(draggedEid, data)
            }

            console.log('render fetch dnd', dropItem.element, data, type, draggedEl, index)
            __renderElements(dropItem.element, data, type, draggedEl, index)
        }

    }
}

// update documents
function updateDocuments(element) {
    // TODO: update crud, delete crud and add to new location 
    // if dropped el in a different storage, database, collection updated
    // if dnd clone do not delete dragged crud,  just add to dropped crud

    let data = CRUD.getObject(element) // data should be object from crud read so we can move
    data.filter = element.getFilter();

    let query = data.filter.query
    if (query && query.length) {
        let object = {}
        for (let i = 0; i < query.length; i++) {
            if (query.operator === "$eq")
                object[query.name] = query.value
            if (query.operator === "$ne")
                object[query.name] = query.value
        }
    }

    if (type === 'document')
        object._id = ''

    data[type] = [object]

    // data.broadcast = false
    // data.broadcastSender = false
    // data.broadcastBrowser = false

    const children = template.querySelectorAll(`[templateid="${template_id}"][eid]:not(.template, [template])`);

    const sortName = item.filter.sort[0].name
    let direction = item.filter.sort[0].direction
    if (direction == 'desc')
        children.reverse()

    const queryName = template.getAttribute('filter-name');
    const queryValue = template.getAttribute('filter-value');
    const queryOperator = template.getAttribute('filter-operator');

    // TODO: handle sort name to update index
    children.forEach((child, index) => {
        let doc = { _id: child.getAttribute('eid') }
        if (sortName)
            doc[sortName] = index
        if (queryName && queryValue && queryOperator == '$eq')
            doc[queryName] = queryValue
        data.document.push({ ...doc })
    });

    if (data.document.length) {
        if (crud)
            crud.updateDocument(data)
        else
            console.log('fetch - dnd reorder data set as crud is unavailable')
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

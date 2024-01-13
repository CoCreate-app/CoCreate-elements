/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

/**
 * Commercial Licensing Information:
 * For commercial use of this software without the copyleft provisions of the AGPLv3,
 * you must obtain a commercial license from CoCreate LLC.
 * For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.
 */

import Observer from '@cocreate/observer';
import Actions from '@cocreate/actions';
import CRUD from '@cocreate/crud-client';
import { dotNotationToObject, queryElements, queryData, sortData, getAttributes, getAttributeNames, checkValue } from '@cocreate/utils';
import filter from '@cocreate/filter';
import { render, renderValue, renderedNodes } from '@cocreate/render';
import '@cocreate/element-prototype';
import './fetchSrc';
import { reset } from './form'

const selector = "[storage], [database], [array], [render-json]";
const elements = new Map();
const keys = new Map();
const forms = new Map();
const debounce = new Map();

/**
 * Initializes elements with specific CRUD attributes. If no parameter is provided, it queries and initializes all elements 
 * that have certain CRUD-related attributes. It can also initialize a single element or an array of elements.
 * 
 * Attributes used for initialization are:
 * - storage: Specifies the storage mechanism.
 * - database: Indicates the database to interact with.
 * - array: Defines the array to be used.
 * - render-json: Determines how JSON data is rendered.
 * 
 * @param {(Element|Element[])} [elements] - Optional. A single element or an array of elements to initialize. 
 *                                           If omitted, the function queries and initializes all elements containing 
 *                                           any of these CRUD attributes: "storage", "database", "array", "render-json".
 */
async function init(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    else if (!element) {
        element = document.querySelectorAll(selector)
        initSocket();
    }

    let dataObjects = new Map();
    for (let i = 0; i < element.length; i++) {
        if (elements.has(element[i]) || element[i].tagName === 'FORM')
            continue

        let data = await initElement(element[i]);
        if (data) {
            let dataKey = initDataKey(element[i], data)
            dataObjects.set(dataKey.string, data)
        }
    }

    if (dataObjects && dataObjects.size > 0) {
        for (let key of dataObjects.keys()) {
            let { data, elements } = keys.get(key)
            read(Array.from(elements.keys()), data, { string: key });
        }
    }
}

async function initElement(el) {
    // if (el.closest('.template')) return;

    let data = getObject(el);
    if (!data || !data.type) return

    if (!elements.has(el)) {
        elements.set(el, '')

        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
            || (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') !== 'false')
            || el.contenteditable) {
            el.addEventListener('input', function (e) {
                const { object, key, isRealtime, isCrdt } = getAttributes(el);
                if (isRealtime == "false" || key == "_id") return;
                if (isCrdt == "true" && object && object !== 'pending') return
                if (e.detail && e.detail.skip == true) return;
                if (data.type !== 'object' && data[data.type] === 'pending') return

                save(el);
            });
        }
    }
    // let attributes = ['filter-key', 'filter-search', 'filter-sort-key', 'filter-on', 'filter-limit']
    // if (el.getFilter || attributes.some(attr => el.hasAttribute(attr))) {
    await filter.init()
    if (el.getFilter) {
        data.$filter = el.getFilter();

        el.setFilter = (filter) => {
            data.$filter = filter
            // let dataKey = initDataKey(el, data)
            read(el, data)
        }
    }

    return data;
}

function getObject(element) {
    const data = getAttributes(element);
    const crudType = ['storage', 'database', 'array', 'index', 'object']

    for (let i = 0; i < crudType.length; i++) {
        if (!checkValue(data[crudType[i]]))
            return

        if (data[crudType[i]] && data[crudType[i]].includes(",")) {
            const array = data[crudType[i]].split(',');
            data[crudType[i]] = []

            for (let j = 0; j < array.length; j++) {
                array[i].trim()
                if (crudType[i] === 'object') {
                    data[crudType[i]].push({ _id: array[j] })
                } else {
                    data[crudType[i]].push(array[j])
                }
            }
        }
    }

    if (data.object || data.object === '' || data.key || data.key === '') {
        if (!data.array || data.array && !data.array.length) return
        data.type = 'object'
    } else if (data.index || data.index === '') {
        if (!data.array || data.array && !data.array.length) return
        data.type = 'index'
    } else if (data.array || data.array === '')
        data.type = 'array'
    else if (data.database || data.database === '')
        data.type = 'database'
    else if (data.storage || data.storage === '')
        data.type = 'storage'
    else if (data.data)
        data.type = 'data'

    delete data.isRealtime
    return data
}

function initDataKey(element, data) {
    let dataKey = getDataKey(data)
    if (keys.has(dataKey.string))
        keys.get(dataKey.string).elements.set(element, '')
    else
        keys.set(dataKey.string, { elements: new Map([[element, '']]), data, dataKey });

    elements.set(element, dataKey.string)

    if (element.parentElement) {
        let form = element.parentElement.closest('form')
        if (form) {
            if (!form.save)
                form.save = () => save(form)

            if (!form.getData)
                form.getData = () => getData(form)

            let formObject = forms.get(form)
            if (formObject) {
                formObject.elements.set(element, data)
                if (formObject.types.has(data.type))
                    formObject.types.get(data.type).set(element, data)
                else
                    formObject.types.set(data.type, new Map([[element, data]]));
            } else
                forms.set(form, { elements: new Map([[element, data]]), types: new Map([[data.type, new Map([[element, data]])]]) });
        }
    }

    if (!element.read)
        element.read = () => read(element)
    if (!element.save)
        element.save = () => save(element)

    return dataKey
}

async function read(element, data, dataKey) {
    if (!dataKey)
        dataKey = { string: elements.get(element) }
    if (!data)
        data = { ...keys.get(dataKey).dataKey.object }

    if (!dataKey || !data.type)
        return
    if (!data.$filter && (!data[data.type] || !data[data.type].length))
        return

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]

    let delay = debounce.get(dataKey.string)
    if (!delay)
        debounce.set(dataKey.string, delay = {})

    if (!delay.elements)
        delay.elements = new Map()

    for (let el of element) {
        const isRead = el.getAttribute('read');
        if (isRead !== 'false')
            delay.elements.set(el, true)
    }

    if (!delay.elements.size)
        return

    clearTimeout(delay.timer);
    delay.timer = setTimeout(function () {
        // TODO: should server support string and string array for type object, methods create, read, delete
        if (!data.$filter && data.type === 'object') {
            if (!data.object)
                return
            else if (typeof data.object === 'string')
                data.object = { _id: data.object }
            else if (Array.isArray(data.object)) {
                if (data.object.length)
                    data.object = { _id: data.object[0]._id }
            } else if (!data.object._id.match(/^[0-9a-fA-F]{24}$/))
                return
        }

        data.method = data.type + '.read'

        CRUD.send(data).then((Data) => {
            debounce.delete(dataKey.string)
            let els = Array.from(delay.elements.keys())
            clearTimeout(delay.timer);
            delete delay.elements
            delete delay.timer

            setData(els, Data);
        })
    }, 500);
}

function get$in(query, mergedValues = []) {
    for (let key of Object.keys(query)) {
        if (key === '$and' || key === '$or' || key === '$nor') {
            for (let i = 0; i < query[key].length; i++) {
                sort$in(query[key][i], mergedValues)
            }
        } else if (typeof query[key] === 'object' && !Array.isArray(query[key])) {
            if (query[key].$in)
                mergedValues = [...mergedValues, ...query[key].$in];
        }
    }
    return mergedValues
}

function sort$in(data, query) {
    let mergedValues = get$in(query);

    if (mergedValues.length) {
        const sorted = mergedValues
            .map(name => data.find(career => career.name === name))
            .filter(career => career !== undefined);
        return sorted
    }
}

async function setData(element, data) {
    if (!element) {
        element = getDataElements(data)
        if (!element.length) return
    }
    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]

    let type = data.type
    if (!type && data.method) {
        type = data.method.split('.')[0]
    } else if (type == 'key')
        type = 'object'

    if (data.$filter && data.$filter.query) {
        let sortedData = sort$in(data[type], data.$filter.query)
        if (sortedData)
            data[type] = sortedData
    }

    for (let el of element) {
        // if rendered in server side skip 
        if (el.hasAttribute('rendered'))
            return el.removeAttribute('rendered');
        if (el.hasAttribute('render-json')) {
            // TODO find the json template in the text or attributes
            // if found add the node as an element, if the element has crud attributes also add as the element
            // for (let attribute of el.attributes) {
            //     if (attribute.value.match(/{{(.*?)}}/)) {
            //         let value = await renderValue(attribute, data[type][0], attribute.value)
            //         if (value)
            //             attribute.value = value
            //     }
            // }
            // if (el.innerHTML.match(/{{(.*?)}}/)) {
            //     let value = renderValue(el, data[type], el.innerHTML)
            //     if (value)
            //         el.innerHTML = value
            // }

            // if (el.textContent.match(/{{(.*?)}}/)) {
            //     let value = renderValue(el, undefined, el.textContent)
            //     if (value)
            //         attribute.value = value
            // }

            // let Data = JSON.parse(match[1]);
            // Data.method = object.read
            // CRUD.send(Data)
            console.log('render-json', '')

        }

        if (!data[type])
            continue;

        let action = el.getAttribute('actions')
        if (action && ['database', 'array', 'object', 'key'].includes(action)) continue;

        const { key, isRead, isListen, isCrdt } = getAttributes(el);
        if (el.getFilter || el.renderValue)
            await filterData(el, data, type, key)
        else {
            let value = CRUD.getValueFromObject(data[type][0], key);
            if (key) {
                if (!data[type].length) continue;
                if (isRead == "false" || isCrdt == "true") continue;
                if (isListen == "false" && !data.method.endsWith('.read')) continue;
            }
            // TODO: object.update data returned from server will not include $operator
            el.setValue(value);
        }
    }
}

async function filterData(element, data, type, key) {
    if (key) {
        if (!data || !type) return
        if (Array.isArray(data[type])) {
            let Data = []
            for (let doc of data[type]) {
                // TODO: should have been handled by getDataElements()
                if (type === 'object') {
                    let _id = element.getAttribute('object')
                    if (_id && doc._id !== _id)
                        return
                }
                if (doc[key]) {
                    if (Array.isArray(doc[key]))
                        Data.push(...doc[key])
                    else
                        Data.push(doc[key])
                } else
                    return
            }
            // if (Data.length === 1) {
            //     data = { [key]: Data[0] }
            // } else
            data = Data
        } else {
            data = { [key]: data[type][key] }
        }
    }

    if (element.getFilter && data.method && !data.method.endsWith('.read'))
        await checkFilters(element, data, type)
    else if (element.renderValue) {
        await element.renderValue(data);
    } else if (data)
        element.setValue(data)

    if (data.$filter) {
        let filterElement = filter.filters.get(element)
        if (filterElement)
            filterElement.index = data.$filter.index
    }

    if (!data[type] || !Array.isArray(data[type]) || !data[type].length)
        return
    const evt = new CustomEvent('fetchedData', { bubbles: true });
    element.dispatchEvent(evt);
}

async function checkFilters(element, data, type) {
    let Data = await element.getData()
    if (!Data) return

    let newData
    if (type) {
        Data = Data[type]
        newData = data[type]
    } else
        newData = data

    let filter = element.getFilter()
    if (filter && filter.query) {
        for (let i = 0; i < newData.length; i++) {
            let isMatch = queryData(newData[i], filter.query)
            if (!isMatch)
                newData.slice(i, 1)
        }
    }

    if (!newData || !newData.length)
        return

    if (Array.isArray(Data)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, Data, newData[i], type, filter)
            }
        } else {
            checkIndex(element, data, Data, newData, type, filter)
        }
    } else {
        let primaryKey
        if (type === 'object') {
            primaryKey = '_id';
        } else {
            primaryKey = 'name';
        }

        if (Data[primaryKey] === newData[primaryKey]) {
            Data = dotNotationToObject(newData, Data)
        }
        if (element.renderValue)
            element.renderValue(data);
        // render({ element, data, key: type });
        else if (data)
            element.setValue(data)
    }
}

function checkIndex(element, data, Data, newData, type, filter) {
    let index
    if (type === 'object') {
        index = Data.findIndex(obj => obj._id === newData._id);
    } else {
        index = Data.findIndex(obj => obj.name === newData.name);
    }

    if (!data.$filter)
        data.$filter = {}

    if (data.method.endsWith('.delete')) {
        if (!index && index !== 0)
            return
        data.$filter.remove = true
    } else {
        if (data.method.endsWith('.create')) {
            if (index === -1) {
                data.$filter.create = true
                if (filter && filter.sort)
                    newData.isNewData = true
                else
                    index = Data.length
                Data.push(newData)
            }
        } else {
            data.$filter.update = true
            data.$filter.currentIndex = index
            Data[index] = dotNotationToObject(newData, Data[index])
            if (filter && filter.sort) {
                Data[index].isNewData = true
            }
        }

        if (filter && filter.sort) {
            Data = sortData(Data, filter.sort)
            index = Data.findIndex(obj => obj.isNewData);
        }

    }

    if (index >= 0) {
        if (data.$filter.currentIndex === index)
            delete data.$filter.currentIndex
        data.$filter.index = index
        if (element.renderValue)
            element.renderValue(data);
        else if (data)
            element.setValue(data)
    }

}

function getDataKey(data) {
    let dataKey = {};
    let attributes = ["host", "organization_id", "apikey", "method", "type", "storage", "database", "array", "index", "object", "key", "updateKey", "$filter", "upsert", "namespace", "room", "broadcast", "broadcastSender", "broadcastBrowser"];

    for (let attribute of attributes) {
        if (attribute === 'key' && data.type === 'object')
            continue
        let value = data[attribute];
        if (value) {
            if (Array.isArray(value)) {
                dataKey[attribute] = [...value];
                if (typeof value[0] === 'string')
                    dataKey[attribute].sort(); // Sort the values alphabetically
            } else {
                dataKey[attribute] = value;
            }
        }
    }

    const object = Object.fromEntries(Object.entries(dataKey).sort(([a], [b]) => a.localeCompare(b)));
    const string = JSON.stringify(object);

    return { string, object };
}

function getDataElements(data) {
    let element = []
    let matchingKeys = getDataKeys(data)
    for (let i = 0; i < matchingKeys.length; i++) {
        let matchingElements = keys.get(matchingKeys[i])
        if (matchingElements && matchingElements.elements && matchingElements.elements.size)
            element.push(...matchingElements.elements.keys())
    }
    return element
}

// TODO: Correctly check for matches 
function getDataKeys(data) {
    const matchingKeyStrings = [];
    const targetKeys = ["type", "storage", "database", "array", "index", "object", '$filter'];

    for (const [keyString, sortedKey] of keys.entries()) {
        let hasMatch = true;

        for (const key of targetKeys) {
            if (!data.$filter && key === '$filter' && sortedKey.data.hasOwnProperty(key))
                hasMatch = true
            else if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (Array.isArray(sortedKey.data[key]) && Array.isArray(data[key])) {
                    // if key is object check _id
                    if (key === 'object' && sortedKey.data.$filter)
                        hasMatch = true
                    else {
                        const matches = sortedKey.data[key].some(value => {
                            if (key === 'object') {
                                return data[key].some(obj => {
                                    return obj._id === value._id
                                });
                            } else {
                                return data[key].includes(value)
                            }
                        });

                        if (!matches) {
                            hasMatch = false;
                            break;
                        }

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

async function getData(form) {
    let dataKeys = new Map()
    let formObject = forms.get(form)
    for (let type of formObject.types.values()) {
        for (let [element, data] of type.entries()) {
            if (!element.hasAttribute('key') || element.getAttribute('save') === 'false')
                continue

            if (element.hasAttribute('actions')) {
                let attribute = element.getAttribute('actions')
                if (attribute.includes('save', 'delete'))
                    continue
            }
            let Data = { ...data }
            let dataKey = elements.get(element)
            let value = await element.getValue()

            // console.log(type, value, data)
            if (!Data[Data.type] && Data.key) {
                Data.method = Data.type + '.create'
                if (Data.type === 'object') {
                    if (typeof Data.object === 'string')
                        Data.object = { _id: Data.object }

                    if (Data.key)
                        Data.object[Data.key] = value

                } else
                    Data[Data.type] = value

            } else if (Data[Data.type] && Data.key) {
                let attributes = element.attributes
                if (Data.key.startsWith('$')) {
                    for (let i = 0; i < attributes.length; i++) {
                        let operators = ['$rename', '$inc', '$push', '$each', '$splice', '$unset', '$delete', '$slice', '$pop', '$shift', '$addToSet', '$pull']
                        if (operators.includes(attributes[i].name)) {
                            Data.key = attributes[i].name + '.' + Data.key
                            break;
                        }
                    }
                }

                if (Data.type = 'object') {
                    if (typeof Data[Data.type] === 'string')
                        if (Data.key == '{}')
                            Data[Data.type] = { _id: Data[Data.type], ...value }
                        else
                            Data[Data.type] = { _id: Data[Data.type], [Data.key]: value }
                    else if (Array.isArray(Data[Data.type]))
                        if (Data.key == '{}')
                            Data[Data.type][0] = { ...Data[Data.type][0], ...value }
                        else {
                            Data[Data.type][0][Data.key] = value
                            if (!Data[Data.type][0]._id)
                                Data.method = Data.type + '.create'
                        }
                    else if (typeof Data[Data.type] === 'object')
                        if (Data.key == '{}')
                            Data[Data.type] = { ...Data[Data.type], ...value }
                        else {
                            Data[Data.type][Data.key] = value
                            if (!Data[Data.type]._id)
                                Data.method = Data.type + '.create'
                        }
                } else {
                    Data[Data.type] = { [Data[Data.type]]: value }
                }

                if (Data.isUpdate || Data.isUpdate === '') {
                    if (!Data.key) return
                    delete Data.isUpdate
                    Data.updateKey = { [Data.key]: value }
                    Data.method = Data.type + '.update'
                } else if (Data.isDelete || Data.isDelete === '') {
                    delete Data.isDelete
                    if (Data.type == 'object' && Data.key) {
                        Data.method = Data.type + '.update'
                        // TODO: Data.type can be a string _id or an array for string _id needs to be converted to object
                        if (typeof Data[Data.type] === 'string')
                            Data[Data.type] = { _id: Data[Data.type], [Data.key]: undefined }
                        else if (Array.isArray(Data[Data.type])) {
                            console.log('Data.type is an array function incomplete')
                        } else if (typeof Data[Data.type] === 'object')
                            Data[Data.type][Data.key] = undefined
                    } else {
                        Data.method = Data.type + '.delete'
                    }
                } else if (Data.type !== 'object' && Data[Data.type] === '') {
                    // if (!Data.key)
                    //     Data.method = Data.type + '.read'
                    // else if (Data.key === 'name')
                    //     Data.method = Data.type + '.create'
                } else if (Data.type !== 'object' && Data[Data.type]) {
                    // if (Data.key)
                    //     Data.method = Data.type + '.update'
                }

            }

            //dataKey should be used to group
            let key = dataKey + Data.method
            if (dataKeys.has(key)) {
                let storedData = dataKeys.get(key)[Data.type]
                dataKeys.get(key)[Data.type] = { ...storedData, ...Data[Data.type] }
            } else {
                dataKeys.set(key, Data)
            }
        }
    }

    // TODO: group by methods so we can make one crud request per method
    let dataArray = Array.from(dataKeys.values())

    return dataArray
}

async function save(element) {
    if (!element) return;
    let data, value
    let upsert = element.getAttribute('upsert')
    if (upsert !== undefined || upsert !== null)
        upsert = true
    if (element.tagName === "FORM") {
        data = await element.getData()
    } else {
        let isSave = element.getAttribute('save')
        if (isSave === 'false') return

        let form = element.closest('form');
        if (form)
            return save(form);

        let dataKey = elements.get(element)
        data = { ...keys.get(dataKey).dataKey.object }

        value = await element.getValue();
        let key = element.getAttribute('key')

        if (typeof data[data.type] === 'string')
            if (key == '{}')
                data[data.type] = { _id: data[data.type], ...value }
            else
                data[data.type] = { _id: data[data.type], [key]: value }
        else if (typeof data[data.type] === 'object')
            if (key == '{}')
                data[data.type] = { ...data[data.type], ...value }
            else
                data[data.type][key] = value

        if (/\.([0-9]*)/g.test(data.key)) {
            let splice = element.getAttribute('splice')
            let slice = element.getAttribute('slice')
            let update = element.getAttribute('update')

            if (splice || splice === "") {
                data[data.type][key] = { $splice: value }
            } else if (slice) {
                data[data.type][key] = '$delete'
            } else if (update) {
                value = data.key.replace(/\[.*?\]/, '[' + value + ']')
                data.updateKey[key] = value
                data[data.type][key] = { $update: value } // $update is string use the value as the key name

                // data[data.type][key] = { $update: {[value]: value} } // $update is an object use the key as the value to use for the new key
            }

        }

        data = [data]
    }


    let Data = []
    for (let i = 0; i < data.length; i++) {
        if (data[i].type === 'object') {
            if (typeof data[i].object === 'string') {
                if (!data[i]._id)
                    data[i].method = 'object.create'
                else {
                    data[i].method = 'object.update'
                    if (upsert)
                        data[i].upsert = true
                }
            } else if (Array.isArray(data[i].object)) {
                if (!data[i].object[0]._id)
                    data[i].method = 'object.create'
                else {
                    data[i].method = 'object.update'
                    if (upsert)
                        data[i].upsert = true
                }
            } else if (typeof data[i].object === 'object') {
                if (!data[i].object._id)
                    data[i].method = 'object.create'
                else {
                    data[i].method = 'object.update'
                    if (upsert)
                        data[i].upsert = true
                }
            }
        }

        if (data[i].method && data[i].method.endsWith('.create')) {
            element.setAttribute(data[i].type, 'pending');
        } else if (data[i].method && data[i].method.endsWith('.update') && data[i].type == 'object' && typeof value == 'string' && window.CoCreate.crdt && !'crdt') {
            return window.CoCreate.crdt.replaceText({
                array: data[i].array,
                key: data[i].key,
                object: data[i].object._id,
                value
            });
        }


        data[i] = await CRUD.send(data[i]);

        Data.push(data[i])

        if (data[i] && (data[i].method.endsWith('.create') || data[i].type !== 'object' && data[i].method.endsWith('.update'))) {
            setTypeValue(element, data[i])
        } else if (data[i])
            document.dispatchEvent(new CustomEvent('saved', {
                detail: data[i]
            }));

    }

    return Data
}

function setTypeValue(element, data) {
    // TODO: if an array name is updated, the attibute array="" needs to be updated.

    if (!data) return;

    let form
    if (element.tagName === "FORM")
        form = element
    else if (element.parentElement)
        form = element.parentElement.closest('form')

    if (!form) {
        if (data.type === 'object') {
            element.setAttribute('object', data.object[0]._id)
        } else {
            element.setAttribute(data.type, data[data.type].name)
        }
    } else {
        let formObject = forms.get(form)
        let elements = formObject.types.get(data.type)

        for (let [el, Data] of elements.entries()) {
            if (data.type === 'object') {
                if (!Data.object || Data.object === 'pending') {
                    Data.object = data.object[0]._id
                    el.setAttribute('object', data.object[0]._id)
                }
            } else if (!Data[data.type]) {
                Data[data.type] = data[data.type].name
                el.setAttribute(data.type, data[data.type].name)
            }
        }
        setData(Array.from(elements.keys()), data)


        //     const state_ids = new Map();

        //     let state_id = form.getAttribute('state_id');
        //     if (state_id) {
        //         // Set state_ids to state_ids if array is not set
        //         if (form.getAttribute('array') == array)
        //             state_ids.set(state_id, '');
        //     }

        //     let objectId = el.getAttribute('object');
        //     let key = el.getAttribute('key')
        //     // set object and state_id attributes to the object id if the object id is pending
        //     if (key && (objectId == '' || objectId == 'pending')) {
        //         el.setAttribute('object', id);
        //         // Set the id attribute of the element
        //         if (key == '_id')
        //             el.setValue(id)
        //         let state_id = el.getAttribute('state_id');
        //         // Set the state id to the state_ids.
        //         if (state_id) {
        //             state_ids.set(state_id, '');
        //         }

        //         if (el.hasAttribute('state-object')) {
        //             let stateObjectId = el.getAttribute('state-object');
        //             // Set the state object id if not set.
        //             if (stateObjectId == '') {
        //                 el.setAttribute('state-object', id);
        //                 let state_id = el.getAttribute('state_id');
        //                 // Set the state id to the state_ids.
        //                 if (state_id) {
        //                     state_ids.set(state_id, '');
        //                 }
        //             }
        //         }

        //         // Set the object attribute of all state_ids to the object attribute of all state_ids
        //         if (state_ids.size > 0) {
        //             for (let key of state_ids.keys()) {
        //                 let stateEls = document.querySelectorAll(`[state_id="${key}"]`)
        //                 for (let stateEl of stateEls) {
        //                     // if (stateEl.getAttribute('array') == array){
        //                     // Set the object id attribute to the stateEl s object if it is not set.
        //                     if (stateEl.getAttribute('object') == '') {
        //                         stateEl.setAttribute('object', id);
        //                     }
        //                     // }
        //                 }
        //             }
        //         }
        //     }
    }

    document.dispatchEvent(new CustomEvent('saved', {
        detail: data
    }));

}

async function remove(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    for (let i = 0; i < element.length; i++) {
        if (element[i].tagName === 'FORM') {
            let form = forms.get(element[i])
            if (!form) return

            form = form.elements
            for (let el of form.keys()) {
                let key = elements.get(el)
                if (key) {
                    keys.get(key).elements.delete(el)
                    elements.delete(el)
                    // debounce.delete(key)
                }
            }
            let key = elements.get(element[i])
            if (key) {
                keys.get(key).elements.delete(element[i])
                if (!keys.get(key).elements.size)
                    keys.delete(key)
            }
            elements.delete(element[i])
            forms.delete(element[i])
        } else {

            let key = elements.get(element[i])
            if (key) {
                if (element[i].getFilter)
                    filter.filters.delete(element[i])
                keys.get(key).elements.delete(element[i])
                elements.delete(element[i])
                if (!keys.get(key).elements.size)
                    keys.delete(key)

                // debounce.delete(key)
                let form = element[i].closest('form')
                form = forms.get(form)
                if (form) {
                    form.elements.delete(element[i])
                    if (!form.elements.size)
                        forms.delete(form)
                }
            } else
                elements.delete(element[i])

        }
    }
}

function initSocket() {
    const type = ["storage", "database", "array", "index", "object", 'filter'];
    const method = ['create', 'update', 'delete'];

    for (let i = 0; i < type.length; i++) {
        for (let j = 0; j < method.length; j++) {
            const action = type[i] + '.' + method[j];

            CRUD.listen(action, function (data) {
                if (data.resolved && data.status === 'received' && CRUD.socket.clientId === data.clientId)
                    return
                setData(null, data);
            });
        }
    }
}

Observer.init({
    name: 'render',
    observe: ['addedNodes'],
    target: '[render-clone]',
    callback: function (mutation) {
        let delayTimer = debounce.get(mutation)
        clearTimeout(delayTimer);
        debounce.delete(mutation.target)

        let renderedNode = renderedNodes.get(mutation.target)
        if (!renderedNode) return

        if (!mutation.movedFrom) return
        let draggedEl = mutation.target
        let draggedFrom = mutation.movedFrom.parentElement
        let droppedEl = mutation.target.nextElementSibling || mutation.target.previousElementSibling
        let droppedIn = mutation.parentElement

        if (!draggedFrom || !droppedIn) return
        dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn)
    }
})

// TODO: has the potential to work on most of the crud elements specifically if the value is an object or an array
async function dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn) {
    let from = await dndCrudData(draggedEl, draggedFrom, 'remove')
    let to = await dndCrudData(droppedEl, droppedIn, 'add')

    if (from && to && !draggedFrom.isSameNode(droppedIn)) {
        let element = getDataElements(from.data)
        if (!element.length) return

        let match = element.find(obj => obj === droppedIn);
        if (!match) {
            if (from.keyPath.includes('.')) {
                let test = { [from.keyPath]: undefined }

                from.newData = dotNotationToObject(test, from.newData)
                dndCrudSend(from.newData, 'update')
            } else {
                const index = from.keyPath.match(/\[(\d+)\]/)
                let removeData = from.newData[from.newData.type].splice(index, 1)[0];
                if (removeData) {
                    removeData.type = from.newData.type
                    removeData[removeData.type] = removeData
                    dndCrudSend(removeData, 'delete')
                }

                if (from.newData[from.newData.type].length)
                    dndCrudSend(from.newData, 'update')

            }
        }
    }

    if (to)
        dndCrudSend(to.newData, 'update')

}

async function dndCrudData(element, parent, operator) {
    if (!elements.has(parent)) return
    let data = await parent.getData()
    let newData = getObject(parent)

    let { Data, sortName, sortDirection, keyPath, clones, index } = dndNewData(element, data)
    newData[newData.type] = []

    if (sortName) {
        for (let i = 0; i < clones.length; i++) {
            if (i > index) {
                let previousData = data[data.type][index]
                if (operator === 'add')
                    Data[sortName] = i + 1
                else if (operator === 'remove')
                    Data[sortName] = i - 1

                newData[newData.type].push({ ...previousData, ...Data })
            }
        }


    } else {
        newData[newData.type] = [{ ...data[data.type][index], ...Data }]
    }

    return { data, newData, keyPath, clones, index }
}

function dndNewData(element, data) {
    let Data = {}
    if (data.$filter.query) {
        dndNewDataUpdate(Data, data.$filter.query)
    }

    let sortName, sortDirection
    let sort = data.$filter.sort
    if (sort && sort.length) {
        // for (let i = 0; i < sort.length; i++) {
        for (let i = sort.length - 1; i >= 0; i--) {
            if (typeof data[sort.key] === 'number') {
                sortName = sort.key
                sortDirection = sort.direction
                break
            }
        }
    }

    let keyPath, clonesMap, clones, index

    let renderedNode = renderedNodes.get(element)
    if (renderedNode) {
        keyPath = renderedNode.keyPath
        clonesMap = renderedNode.template.clones
        clones = Array.from(clonesMap.values());
        index = clones.indexOf(element);
    }

    return { Data, sortName, sortDirection, keyPath, clones, index }

}

function dndNewDataUpdate(Data, query) {
    for (let key of Object.keys(query)) {
        if (key === '$and' || key === '$or' || key === '$nor') {
            for (let i = 0; i < query[key].length; i++) {
                dndNewDataUpdate(Data, query[key][i])
            }
        } else if (typeof query[key] === 'object' && !Array.isArray(query[key])) {
            if (query[key].$eq)
                Data[key] = query[key].$eq
            if (query[key].$ne)
                Data[key] = query[key].$ne
        } else {
            Data[key] = query[key]
        }
    }
}

function dndCrudSend(data, crudType) {
    if (CRUD) {
        let action = data.type;
        action = action.charAt(0).toUpperCase() + action.slice(1);
        CRUD[crudType + action](data)
    } else
        console.log('dnd reordered data set as crud is unavailable')
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
        // if (mutation.target.parentElement) return
        // if (mutation.target.parentElement) {
        //     let delayTimer = setTimeout(function () {
        //         debounce.delete(mutation.target)
        //         remove(mutation.target)
        //     }, 3000);
        //     debounce.set(mutation.target, delayTimer)
        // } else
        if (mutation.target.hasAttribute('render-clone'))
            return
        remove(mutation.target)
    }
});

Observer.init({
    name: 'CoCreateElementsAttributes',
    observe: ['attributes'],
    attributeName: ['storage', 'database', 'array', 'index', 'object', 'key'],
    // target: selector, // blocks mutations when applied
    callback: function (mutation) {
        let currentValue = mutation.target.getAttribute(mutation.attributeName)
        if (currentValue !== mutation.oldValue) {
            remove(mutation.target)
            init([mutation.target])
        }
    }
});

Actions.init([
    {
        name: "save",
        endEvent: "saved",
        callback: (action) => {
            if (action.form)
                save(action.form);
        }
    },
    {
        name: "delete",
        endEvent: "deleted",
        callback: async (action) => {
            let elements = queryElements({ element: action.element, prefix: 'delete' });
            if (elements === false)
                elements = [action.element]

            for (let i = 0; i < elements.length; i++) {
                const data = getObject(elements[i]);
                if (!data) return
                data.method = data.type + '.delete'

                if (elements[i].renderValue) {
                    let selected = elements[i].querySelectorAll('.selected')
                    data[data.type] = []
                    for (let j = 0; j < selected.length; j++) {
                        let attribute = selected[j].getAttribute(data.type)
                        if (attribute) {
                            attribute = attribute.split(',')
                            for (let k = 0; k < attribute.length; k++) {
                                if (data.type === 'object')
                                    data[data.type].push({ _id: attribute[k] })
                                else {
                                    data[data.type].push(attribute[k])
                                }
                            }
                        }
                    }
                } else if (data.type === 'object' && typeof data[data.type] === 'string')
                    data[data.type] = { _id: data[data.type] }

                let response = await CRUD.send(data)
                document.dispatchEvent(new CustomEvent('deleted', {
                    detail: response
                }));
            }
        }
    }
]);

init();

export default { init, read, save, getData, getObject, reset, elements, keys, forms, debounce, getAttributes };

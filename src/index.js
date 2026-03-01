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

import Observer from "@cocreate/observer";
import Actions from "@cocreate/actions";
import CRUD from "@cocreate/crud-client";
import {
    dotNotationToObject,
    queryElements,
    queryData,
    sortData,
    getAttributes,
    getAttributeNames,
    checkValue,
    getValueFromObject
} from "@cocreate/utils";
import filter from "@cocreate/filter";
import { render, renderValue, renderedNodes } from "@cocreate/render";
import "@cocreate/element-prototype";
import "./fetchSrc";
import { reset } from "./form";
import "./value.js";

const selector = "[storage], [database], [array], [render-json]";
const elements = new WeakMap();
const forms = new WeakMap();
const keys = new Map();
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
 * If omitted, the function queries and initializes all elements containing
 * any of these CRUD attributes: "storage", "database", "array", "render-json".
 */
async function init(element) {
    if (
        element &&
        !(element instanceof HTMLCollection) &&
        !(element instanceof NodeList) &&
        !Array.isArray(element)
    ) {
        element = [element];
    } else if (!element) {
        element = document.querySelectorAll(selector);
        initSocket();
    }

    let promises = [];
    for (let i = 0; i < element.length; i++) {
        if (
            elements.has(element[i]) ||
            element[i].tagName === "FORM" ||
            element[i].getAttribute("crud") === "false"
        )
            continue;

        promises.push(
            (async () => {
                let data = await initElement(element[i]);
                if (data) {
                    let dataKey = initDataKey(element[i], data);
                    return { string: dataKey.string, data };
                }
            })()
        );
    }

    let results = await Promise.all(promises);
    let dataObjects = new Map();

    for (let res of results) {
        if (res) dataObjects.set(res.string, res.data);
    }

    if (dataObjects && dataObjects.size > 0) {
        for (let key of dataObjects.keys()) {
            let { data, elements: mappedElements } = keys.get(key);
            read(Array.from(mappedElements.keys()), data, { string: key });
        }
    }
}

async function initElement(el) {
    let data = getObject(el);
    if (!data || !data.type) return;

    if (
        data.object &&
        data.object !== "pending" &&
        !/^[0-9a-fA-F]{24}$/.test(data.object)
    )
        return;

    if (!elements.has(el)) {
        elements.set(el, "");

        if (!el.elementsInputEvent) {
            el.elementsInputEvent = true;

            if (
                ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
                (el.hasAttribute("contenteditable") &&
                    el.getAttribute("contenteditable") !== "false") ||
                el.contenteditable || el.value !== undefined || el.hasAttribute("value")
            ) {
                if (el.tagName == "IFRAME") {
                    // ToDo: saving on contenteditable elements when an objectId does not exist in order to crud or crdt
                    el = el.contentDocument.documentElement;
                    el.setAttribute("contenteditable", "true");
                }

                el.addEventListener("input", function (e) {
                    if (el.pendingObject) return;

                    const { object, key, isRealtime, isCrdt } =
                        getAttributes(el);
                    if (!isRealtime || isRealtime === "false" || key === "_id")
                        return;
                    if (isCrdt == "true" && object && object !== "pending")
                        return;
                    if (e.detail && e.detail.skip == true) return;
                    if (data.type !== "object" && data[data.type] === "pending")
                        return;
                    if (!el.value && !el.hasAttribute("value") && el.contenteditable && !el.hasAttribute("contenteditable")) return;
                    save(el);
                });
            }
        }
    }

    await filter.init(el);

    if (el.getFilter) {
        data.$filter = await el.getFilter();

        el.setFilter = (filter) => {
            data.$filter = filter;
            el.hasRead = false;
            read(el, data);
        };
    }

    return data;
}

function getObject(element) {
    const data = getAttributes(element);
    const crudType = ["storage", "database", "array", "index", "object"];

    for (let i = 0; i < crudType.length; i++) {
        if (!checkValue(data[crudType[i]])) return;

        if (data[crudType[i]] && data[crudType[i]].includes(",")) {
            const array = data[crudType[i]].split(",");
            data[crudType[i]] = [];

            for (let j = 0; j < array.length; j++) {
                array[j].trim();
                if (crudType[i] === "object") {
                    data[crudType[i]].push({ _id: array[j] });
                } else {
                    data[crudType[i]].push(array[j]);
                }
            }
        }
    }

    if (data.object || data.object === "" || data.key || data.key === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "object";
    } else if (data.index || data.index === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "index";
    } else if (data.array || data.array === "") data.type = "array";
    else if (data.database || data.database === "") data.type = "database";
    else if (data.storage || data.storage === "") data.type = "storage";
    else if (data.data) data.type = "data";

    delete data.isRealtime;
    return data;
}

function initDataKey(element, data) {
    let dataKey = getDataKey(data);
    if (keys.has(dataKey.string))
        keys.get(dataKey.string).elements.set(element, "");
    else
        keys.set(dataKey.string, {
            elements: new Map([[element, ""]]),
            data,
            dataKey
        });

    elements.set(element, dataKey.string);

    if (element.parentElement) {
        let form = element.closest("form");
        if (form) {
            if (!form.save) form.save = () => save(form);

            if (!form.getData) form.getData = () => getData(form);

            let formObject = forms.get(form);
            if (formObject) {
                formObject.elements.set(element, data);
                if (formObject.types.has(data.type))
                    formObject.types.get(data.type).set(element, data);
                else
                    formObject.types.set(data.type, new Map([[element, data]]));
            } else
                forms.set(form, {
                    elements: new Map([[element, data]]),
                    types: new Map([[data.type, new Map([[element, data]])]])
                });
        }
    }

    if (!element.read) element.read = () => read(element);
    if (!element.save) element.save = () => save(element);

    return dataKey;
}

async function read(element, data, dataKey) {
    if (!dataKey) dataKey = { string: elements.get(element) };
    if (!data) {
        let existingData = keys.get(dataKey.string);
        if (existingData && existingData.dataKey && existingData.dataKey.object)
            data = { ...existingData.dataKey.object };
    }

    if (!dataKey || !data.type) return;
    if (!data.$filter && (!data[data.type] || !data[data.type].length)) return;

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element];

    let delay = debounce.get(dataKey.string);
    if (!delay) debounce.set(dataKey.string, (delay = {}));

    if (!delay.elements) delay.elements = new Map();

    for (let el of element) {
        const isRead = el.getAttribute("read");
        if (
            isRead !== "false" &&
            !el.hasRead &&
            (!data.$filter || (data.$filter && data.$filter.isFilter !== false))
        ) {
            el.hasRead = true;
            delay.elements.set(el, true);
        } else {
            // console.log("read skipped", el);
        }
    }

    if (!delay.elements.size) return;

    clearTimeout(delay.timer);
    delay.timer = setTimeout(function () {
        // TODO: should server support string and string array for type object, methods create, read, delete
        if (!data.$filter && data.type === "object") {
            if (!data.object) return;
            else if (typeof data.object === "string")
                data.object = { _id: data.object };
            else if (Array.isArray(data.object)) {
                if (data.object.length)
                    data.object = { _id: data.object[0]._id };
            } else if (!data.object._id.match(/^[0-9a-fA-F]{24}$/)) return;
            // if (data.object._id.startsWith('$'))
            //     return
        }

        data.method = data.type + ".read";

        CRUD.send(data).then((responseData) => {
            debounce.delete(dataKey.string);
            let els = Array.from(delay.elements.keys());
            clearTimeout(delay.timer);
            delete delay.elements;
            delete delay.timer;

            setData(els, responseData);
        });
    }, 500);
}

function get$in(query, mergedValues = []) {
    for (let key of Object.keys(query)) {
        if (key === "$and" || key === "$or" || key === "$nor") {
            for (let i = 0; i < query[key].length; i++) {
                sort$in(query[key][i], mergedValues);
            }
        } else if (
            typeof query[key] === "object" &&
            !Array.isArray(query[key])
        ) {
            if (query[key].$in)
                mergedValues = [...mergedValues, ...query[key].$in];
        }
    }
    return mergedValues;
}

function sort$in(data, query) {
    let mergedValues = get$in(query);

    if (mergedValues.length) {
        const sorted = mergedValues
            .map((name) => data.find((career) => career.name === name))
            .filter((career) => career !== undefined);
        return sorted;
    }
}

async function setData(element, data) {
    if (!element) {
        element = getDataElements(data);
        if (!element.length) return;
    }
    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element];

    let type = data.type;
    if (!type && data.method) {
        type = data.method.split(".")[0];
    } else if (type == "key") type = "object";

    if (data.$filter && data.$filter.query) {
        let sortedData = sort$in(data[type], data.$filter.query);
        if (sortedData && sortedData.length) data[type] = sortedData;
    }

    for (let el of element) {
        // if rendered in server side skip
        if (el.hasAttribute("rendered")) return el.removeAttribute("rendered");
        if (el.hasAttribute("render-json")) {
            console.log("render-json", "");
        }

        let reference = el.getAttribute("reference");
        let action = el.getAttribute("actions");
        if (action && ["database", "array", "object", "key"].includes(action))
            continue;

        if (data.array.includes("aiConversations")) {
            console.log("testing ai conversations");
        }

        const { key, isRead, isUpdate, isListen, isCrdt } = getAttributes(el);
        let elementType = el.getAttribute("type");
        if (elementType !== "file" && (el.getFilter || el.renderValue))
            await filterData(el, data, type, key);
        else {
            if (!data[type] || !data[type].length) {
                if (el.hasAttribute("value-dispatch")) el.setValue("");
                continue;
            }

            if (key && checkValue(key)) {
                let value;
                if (key.includes("$length")) {
                    value = CRUD.getValueFromObject(
                        data[type][0],
                        key.replace(/\.\$length$/, "")
                    );
                    if (value) value = value.length;
                    else value = 0;
                } else {
                    let $update = data[type][0].$update;
                    if ($update) {
                        delete data[type][0].$update;
                        data[type][0] = { ...data[type][0], ...$update };
                    } else if (key === "$data") {
                        value = data;
                    } else if (key && key.startsWith("$data")) {
                        value = CRUD.getValueFromObject(data, key.slice(1));
                    } else if (key === `$${type}`) {
                        value = data[type];
                    } else if (key && key.startsWith(`$${type}`)) {
                        value = CRUD.getValueFromObject(data, key.slice(1));
                    } else if (key === "{}") {
                        value = data[type][0];
                        if (reference === "false") {
                            delete data[type][0].$storage;
                            delete data[type][0].$database;
                            delete data[type][0].$array;
                        }
                    } else {
                        value = CRUD.getValueFromObject(data[type][0], key);
                    }
                }

                if (!data[type].length) continue;
                if (isRead === "false" || isCrdt === "true") continue;
                if (
                    isUpdate === "false" ||
                    (isListen === "false" && !data.method.endsWith(".read"))
                )
                    continue;

                // TODO: object.update data returned from server will not include $operator
                el.setValue(value);
            }
        }
    }
}

async function filterData(element, data, type, key) {
    let operator = "",
        value;

    if (key && !key.includes("$length") && key !== "{}") {
        if (!data || !type) return;

        if (key.startsWith("$")) {
            operator = key.split(".")[0] || "";
        }

        let property = key;
        if (operator) {
            property = property.replace(operator + ".", "");
            if (operator === "$sum") {
                value = 0;
            }
        }
        if (Array.isArray(data[type])) {
            let filteredItems = [],
                isObject;
            for (let doc of data[type]) {
                if (!doc.$storage) continue;
                // TODO: should have been handled by getDataElements()
                if (type === "object") {
                    let _id = element.getAttribute("object");
                    if (_id && doc._id !== _id) continue;
                    let $update = doc.$update;
                    if ($update) {
                        delete doc.$update;
                        doc = { ...doc, ...$update };
                    }
                }
                let docValue = getValueFromObject(doc, property);
                if (docValue) {
                    if (operator === "$sum" && typeof docValue === "number") {
                        if (typeof value !== "number") value = 0;
                        value += docValue || 0;
                    } else if (Array.isArray(docValue)) {
                        filteredItems.push(...docValue);
                    } else {
                        isObject = true;
                        filteredItems.push(docValue);
                    }
                } else continue;
            }

            if (isObject && filteredItems.length === 1) {
                filteredItems = filteredItems[0];
            }
            if (!operator) data = filteredItems;
        } else {
            data = { [property]: data[type][property] };
        }
    }

    let isRendered = element.querySelector("[render-clone]");
    if (operator) {
        element.setValue(value);
    } else if (
        element.renderValue &&
        data.method &&
        data.method.endsWith(".read") &&
        data.$filter &&
        (data.$filter.overwrite || !isRendered)
    ) {
        await element.renderValue(data);
    } else if (
        (data.$filter && data.$filter.loadmore) ||
        (data.method && data.method.endsWith(".read") && isRendered)
    ) {
        await loadMore(element, data, type);
    } else if (
        element.getFilter &&
        data.method &&
        !data.method.endsWith(".read")
    ) {
        await checkFilters(element, data, type);
    } else if (element.renderValue) {
        if (key)
            data = {[key]: data}
        await element.renderValue(data);
    } else if (key === "$length") {
        element.setValue(data[type].length);
    } else if (key && key.includes("$length")) {
        let value = CRUD.getValueFromObject(
            data[type][0],
            key.replace(/\.\$length$/, "")
        );
        element.setValue(value.length);
    } else if (key === "$data") {
        value = data;
    } else if (key && key.startsWith("$data")) {
        value = CRUD.getValueFromObject(data, key.slice(1));
    } else if (key === `$${type}`) {
        value = data[type];
    } else if (key && key.startsWith(`$${type}`)) {
        value = CRUD.getValueFromObject(data, key.slice(1));
    } else if (key === "{}") {
        value = data[type][0];
    } else if (data) element.setValue(data);

    if (data.$filter) {
        let filterElement = filter.filters.get(element);
        if (filterElement) filterElement.index = data.$filter.index;
    }

    if (!data[type] || !Array.isArray(data[type]) || !data[type].length) return;

    const evt = new CustomEvent("fetchedData", { bubbles: true });
    element.dispatchEvent(evt);
}

async function loadMore(element, data, type, sort) {
    let clonedData = { ...data };
    let renderedData = await element.getData();
    if (!renderedData || !renderedData[type]) {
        return;
    }
    for (let i = 0; i < clonedData[type].length; i++) {
        let index;
        if (type === "object") {
            index = renderedData[type].findIndex(
                (obj) => obj._id === clonedData[type][i]._id
            );
        } else {
            index = renderedData[type].findIndex(
                (obj) => obj.name === clonedData[type][i].name
            );
        }

        if (index >= 0) {
            clonedData[type].splice(i, 1);
            i--; // Adjust the index to account for the removed item
        }
    }
    if (clonedData[type].length > 0) {
        await element.renderValue(clonedData);
    }
}

async function checkFilters(element, data, type) {
    let localData;
    if (!element.getData) {
        // TODO: fix: getObject as this is related to render or form, but filter could exist on an input which does not have getObject
        // TODO: generate an object of current element key: value to use with filter. because filter is used object is not defined
        localData = getObject(element);
        if (Array.isArray(localData[type])) localData = localData[type][0];
    } else localData = await element.getData();

    if (!localData) return;

    let newData;
    if (type) {
        localData = localData[type];
        newData = data[type];
    } else newData = data;

    let filter = await element.getFilter();
    if (filter && filter.query) {
        newData = newData.filter(item => queryData(item, filter.query));
    }

    if (!newData || !newData.length) return;

    if (Array.isArray(localData)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, localData, newData[i], type, filter);
            }
        } else {
            checkIndex(element, data, localData, newData, type, filter);
        }
    } else {
        let primaryKey;
        if (type === "object") {
            primaryKey = "_id";
        } else {
            primaryKey = "name";
        }

        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                if (
                    typeof localData === "string" &&
                    localData === newData[i][primaryKey]
                ) {
                    localData = newData[i];
                } else if (localData[primaryKey] === newData[i][primaryKey]) {
                    localData = dotNotationToObject(newData[i], localData);
                }
            }
        } else if (typeof localData === "string" && localData === newData[primaryKey]) {
            localData = newData;
        } else if (localData[primaryKey] === newData[primaryKey]) {
            localData = dotNotationToObject(newData, localData);
        }

        if (element.renderValue) element.renderValue(data);
        // render({ element, data, key: type });
        else if (data) element.setValue(localData);
    }
}

function checkIndex(element, data, localData, newData, type, filter) {
    let index;
    if (type === "object") {
        index = localData.findIndex((obj) => obj._id === newData._id);
    } else {
        index = localData.findIndex((obj) => obj.name === newData.name);
    }

    if (!data.$filter) data.$filter = {};

    if (data.method.endsWith(".delete")) {
        if (index === -1) return;
        data.$filter.remove = true;
        localData.splice(index, 1);
    } else {
        if (data.method.endsWith(".create")) {
            if (index === -1) {
                data.$filter.create = true;
                if (filter && filter.sort) newData.isNewData = true;
                else index = localData.length;
                localData.push(newData);
            }
        } else {
            if (index === -1) return;
            data.$filter.update = true;
            data.$filter.currentIndex = index;
            localData[index] = dotNotationToObject(newData, localData[index]);
            if (filter && filter.sort) {
                localData[index].isNewData = true;
            }
        }

        if (filter && filter.sort) {
            localData = sortData(localData, filter.sort);
            index = localData.findIndex((obj) => obj.isNewData);
        }
    }

    if (index >= 0) {
        if (data.$filter.currentIndex === index)
            delete data.$filter.currentIndex;
        data.$filter.index = index;
        if (element.renderValue) element.renderValue(data);
        else if (data) element.setValue(localData);
    }
}

function getDataKey(data) {
    let dataKey = {};
    let attributes = [
        "host",
        "organization_id",
        "apikey",
        "method",
        "type",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key",
        "updateKey",
        "$filter",
        "upsert",
        "namespace",
        "room",
        "broadcast",
        "broadcastSender",
        "broadcastBrowser"
    ];

    for (let attribute of attributes) {
        if (attribute === "key" && data.type === "object") continue;
        let value = data[attribute];
        if (value) {
            if (Array.isArray(value)) {
                dataKey[attribute] = [...value];
                if (typeof value[0] === "string") dataKey[attribute].sort(); // Sort the values alphabetically
            } else {
                dataKey[attribute] = value;
            }
        }
    }

    const object = Object.fromEntries(
        Object.entries(dataKey).sort(([a], [b]) => a.localeCompare(b))
    );
    const string = JSON.stringify(object);

    return { string, object };
}

function getDataElements(data) {
    let element = [];
    let matchingKeys = getDataKeys(data);
    for (let i = 0; i < matchingKeys.length; i++) {
        let matchingElements = keys.get(matchingKeys[i]);
        if (matchingElements?.elements?.size)
            element.push(...matchingElements.elements.keys());
    }
    return element;
}

// TODO: Correctly check for matches
function getDataKeys(data) {
    const matchingKeyStrings = [];
    const targetKeys = [
        "type",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "$filter"
    ];

    for (const [keyString, sortedKey] of keys.entries()) {
        let hasMatch = true;

        for (const key of targetKeys) {
            if (
                !data.$filter &&
                key === "$filter" &&
                sortedKey.data.hasOwnProperty(key)
            )
                hasMatch = true;
            else if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (
                    Array.isArray(sortedKey.data[key]) &&
                    Array.isArray(data[key])
                ) {
                    // if key is object check _id
                    if (key === "object" && sortedKey.data.$filter)
                        hasMatch = true;
                    else {
                        const matches = sortedKey.data[key].some((value) => {
                            if (key === "object") {
                                return data[key].some((obj) => {
                                    return obj._id === value._id;
                                });
                            } else {
                                return data[key].includes(value);
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

function formatPayload(payload, value, element) {
    if (!payload[payload.type] && payload.key) {
        payload.method = payload.type + ".create";
        if (payload.type === "object") {
            if (!payload.object) payload.object = {};
            else if (typeof payload.object === "string")
                payload.object = { _id: payload.object };

            if (payload.key) {
                if (payload.key == "{}") {
                    if (Array.isArray(value)) {
                        payload.object = value;
                    } else payload.object = { ...payload.object, ...value };
                } else payload.object[payload.key] = value;
            }
            if (payload.isUpsert && payload.$filter)
                payload.method = "object.update";
        } else payload[payload.type] = value;
    } else if (payload[payload.type] && payload.key) {
        let attributes = element.attributes;
        if (payload.key.startsWith("$")) {
            const operators = ["$rename", "$inc", "$push", "$each", "$splice", "$unset", "$delete", "$slice", "$pop", "$shift", "$addToSet", "$pull"];
            const matchedAttr = Array.from(attributes).find(attr => operators.includes(attr.name));
            if (matchedAttr) {
                payload.key = matchedAttr.name + "." + payload.key;
            }
        }

        if (payload.type === "object") {
            if (typeof payload[payload.type] === "string")
                if (payload.key == "{}") {
                    if (Array.isArray(value))
                        payload[payload.type] = {
                            _id: payload[payload.type],
                            ...value[0]
                        };
                    else
                        payload[payload.type] = {
                            _id: payload[payload.type],
                            ...value
                        };
                } else
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: value
                    };
            else if (Array.isArray(payload[payload.type]))
                if (payload.key == "{}")
                    payload[payload.type][0] = {
                        ...payload[payload.type][0],
                        ...value
                    };
                else {
                    if (payload[payload.type][0]) {
                        payload[payload.type][0][payload.key] = value;
                    }
                    if (!payload[payload.type][0]._id)
                        payload.method = payload.type + ".create";
                }
            else if (typeof payload[payload.type] === "object")
                if (payload.key == "{}")
                    payload[payload.type] = { ...payload[payload.type], ...value };
                else {
                    payload[payload.type][payload.key] = value;
                    if (!payload[payload.type]._id)
                        payload.method = payload.type + ".create";
                }
        } else {
            payload[payload.type] = { [payload[payload.type]]: value };
        }

        if (payload.isUpdate || payload.isUpdate === "") {
            if (!payload.key) return false;
            delete payload.isUpdate;
            payload.updateKey = { [payload.key]: value };
            payload.method = payload.type + ".update";
        } else if (payload.isDelete || payload.isDelete === "") {
            delete payload.isDelete;
            if (payload.type == "object" && payload.key) {
                payload.method = payload.type + ".update";
                if (typeof payload[payload.type] === "string")
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: undefined
                    };
                else if (Array.isArray(payload[payload.type])) {
                    console.log(
                        "payload.type is an array function incomplete"
                    );
                } else if (typeof payload[payload.type] === "object")
                    payload[payload.type][payload.key] = undefined;
            } else {
                payload.method = payload.type + ".delete";
            }
        }
    }
    return true;
}

async function getData(form) {
    let dataKeys = new Map();
    let formObject = forms.get(form);
    if (!formObject) {
        let elements = form.querySelectorAll(selector);
        await init(elements);
        return await getData(form);
    }

    for (let type of formObject.types.values()) {
        for (let [element, data] of type.entries()) {
            if (
                !element.hasAttribute("key") ||
                element.getAttribute("save") === "false"
            )
                continue;

            if (element.hasAttribute("actions")) {
                let attribute = element.getAttribute("actions");
                if (attribute.includes("save") || attribute.includes("delete")) continue;
            }

            if (element.matches("[render-query]")) {
                let type = element.getAttribute("type");
                if (type !== "file") continue;
            }

            let value = await element.getValue();
            if (value === undefined) continue;

            let payload = { ...data };
            let dataKey = elements.get(element);

            let success = formatPayload(payload, value, element);
            if (!success) continue;

            //dataKey should be used to group
            let key = dataKey; //+ payload.method;
            if (dataKeys.has(key)) {
                let storedData = dataKeys.get(key)[payload.type];
                dataKeys.get(key)[payload.type] = {
                    ...storedData,
                    ...payload[payload.type]
                };
            } else {
                dataKeys.set(key, payload);
            }
        }
    }

    // TODO: group by methods so we can make one crud request per method
    let dataArray = Array.from(dataKeys.values());

    return dataArray;
}

async function save(element, action) {
    if (!element) return;
    let data, value, form;
    let upsert = element.getAttribute("upsert");
    if (upsert && upsert !== "false") upsert = true;
    if (element.tagName === "FORM") {
        data = await element.getData();
    } else {
        let isSave = element.getAttribute("save");
        if (isSave === "false") return;
        if (action) {
            form = element.closest("form");
            if (form) {
                return save(form);
            }
        }

        let dataKey = elements.get(element);
        data = { ...keys.get(dataKey).dataKey.object };

        value = await element.getValue();
        let key = element.getAttribute("key");

        if (typeof data[data.type] === "string")
            if (key == "{}")
                data[data.type] = { _id: data[data.type], ...value };
            else data[data.type] = { _id: data[data.type], [key]: value };
        else if (typeof data[data.type] === "object")
            if (key == "{}") data[data.type] = { ...data[data.type], ...value };
            else data[data.type][key] = value;

        if (/\.([0-9]*)/g.test(data.key)) {
            let splice = element.getAttribute("splice");
            let slice = element.getAttribute("slice");
            let update = element.getAttribute("update");

            if (splice || splice === "") {
                data[data.type][key] = { $splice: value };
            } else if (slice) {
                data[data.type][key] = "$delete";
            } else if (update) {
                value = data.key.replace(/\[.*?\]/, "[" + value + "]");
                data.updateKey[key] = value;
                data[data.type][key] = { $update: value }; // $update is string use the value as the key name

                // data[data.type][key] = { $update: {[value]: value} } // $update is an object use the key as the value to use for the new key
            }
        }

        data = [data];
    }

    let responseDataList = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i].type === "object") {
            let hasId = false;

            // 1. Check your three scenarios just like before
            if (typeof data[i].object === "string") {
                hasId = !!data[i]._id; 
            } else if (Array.isArray(data[i].object)) {
                hasId = !!data[i].object[0]?._id;
            } else if (typeof data[i].object === "object" && data[i].object !== null) {
                hasId = !!data[i].object?._id;
            }

            // 2. Apply the method based on what we found
            if (!data[i].object || !hasId) {
                data[i].method = "object.create";
            } else {
                data[i].method = "object.update";
                if (upsert) data[i].upsert = true;
            }
        }

        if (data[i].isUpsert) {
            data[i].upsert = true;
            delete data[i].isUpsert;
        }

        if (data[i].method && data[i].method.endsWith(".create")) {
            element.setAttribute(data[i].type, "pending");
        } else if (
            data[i].method &&
            data[i].method.endsWith(".update") &&
            data[i].type == "object" &&
            typeof value == "string" &&
            window.CoCreate.crdt &&
            !"crdt"
        ) {
            return window.CoCreate.crdt.replaceText({
                array: data[i].array,
                key: data[i].key,
                object: data[i].object._id,
                value
            });
        }

        data[i] = await CRUD.send(data[i]);

        responseDataList.push(data[i]);

        if (
            data[i] &&
            (data[i].method.endsWith(".create") ||
                (data[i].type !== "object" &&
                    data[i].method.endsWith(".update")))
        ) {
            setTypeValue(element, data[i], action);
        } else if (data[i]) {
            if (action) {
                action.element.dispatchEvent(
                    new CustomEvent("saved", {
                        detail: data
                    })
                );
            } else {
                document.dispatchEvent(
                    new CustomEvent("saved", {
                        detail: data
                    })
                );
            }
        }
    }

    return responseDataList;
}

function setTypeValue(element, data, action) {
    // TODO: if an array name is updated, the attibute array="" needs to be updated.

    if (!data) return;

    let form;
    if (element.tagName === "FORM") form = element;
    else if (element.parentElement)
        form = element.parentElement.closest("form");

    if (!form) {
        if (data.type === "object") {
            if (data.object?.[0]?._id) {
                element.setAttribute("object", data.object[0]._id);
            }
        } else {
            element.setAttribute(data.type, data[data.type].name);
        }
    } else {
        let formObject = forms.get(form);
        if (form.getAttribute("object") === "pending")
            form.setAttribute("object", data.object[0]._id);

        let elements = formObject.types.get(data.type);

        for (let [el, elData] of elements.entries()) {
            if (data.type === "object") {
                if (!elData.object || elData.object === "pending") {
                    elData.object = data.object[0]._id;
                    el.setAttribute("object", data.object[0]._id);
                }
            } else if (!elData[data.type]) {
                elData[data.type] = data[data.type].name;
                el.setAttribute(data.type, data[data.type].name);
            }
        }
        setData(Array.from(elements.keys()), data);
    }

    if (action) {
        action.element.dispatchEvent(
            new CustomEvent("saved", {
                detail: data
            })
        );
    } else {
        document.dispatchEvent(
            new CustomEvent("saved", {
                detail: data
            })
        );
    }
}

async function remove(element) {
    if (
        element &&
        !(element instanceof HTMLCollection) &&
        !Array.isArray(element)
    )
        element = [element];
    for (let i = 0; i < element.length; i++) {
        delete element[i].hasRead;
        if (element[i].tagName === "FORM") {
            let form = forms.get(element[i]);
            if (!form) return;

            form = form.elements;
            for (let el of form.keys()) {
                let key = elements.get(el);
                if (key) {
                    keys.get(key).elements.delete(el);
                    elements.delete(el);
                    // debounce.delete(key)
                }
            }
            let key = elements.get(element[i]);
            if (key) {
                keys.get(key).elements.delete(element[i]);
                if (!keys.get(key).elements.size) keys.delete(key);
            }
            elements.delete(element[i]);
            forms.delete(element[i]);
        } else {
            let key = elements.get(element[i]);
            if (key) {
                if (element[i].getFilter) filter.filters.delete(element[i]);
                keys.get(key).elements.delete(element[i]);
                elements.delete(element[i]);
                if (!keys.get(key).elements.size) keys.delete(key);

                // debounce.delete(key)
                let form = element[i].closest("form");
                form = forms.get(form);
                if (form) {
                    form.elements.delete(element[i]);
                    if (!form.elements.size) forms.delete(form);
                }
            } else elements.delete(element[i]);
        }
    }
}

function initSocket() {
    const type = ["storage", "database", "array", "index", "object", "filter"];
    const method = ["create", "update", "delete"];

    for (let i = 0; i < type.length; i++) {
        for (let j = 0; j < method.length; j++) {
            const action = type[i] + "." + method[j];

            CRUD.listen(action, function (data) {
                if (
                    data.resolved &&
                    data.status === "received" &&
                    CRUD.socket.clientId === data.clientId
                )
                    return;
                if (data.rendered) return;

                data.rendered = true;

                setData(null, data);
            });
        }
    }
}

Observer.init({
    name: "render",
    types: ["addedNodes"],
    selector: "[render-clone]",
    callback: function (mutation) {
        if (
            mutation.parentElement &&
            !mutation.parentElement.hasAttribute("dnd")
        )
            return;
        let delayTimer = debounce.get(mutation);
        clearTimeout(delayTimer);
        debounce.delete(mutation.target);

        let renderedNode = renderedNodes.get(mutation.target);
        if (!renderedNode) return;

        if (!mutation.movedFrom) return;
        let draggedEl = mutation.target;
        let draggedFrom = mutation.movedFrom.parentElement;
        let droppedEl =
            mutation.target.nextElementSibling ||
            mutation.target.previousElementSibling;
        let droppedIn = mutation.parentElement;

        if (!draggedFrom || !droppedIn) return;
        dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn);
    }
});

// TODO: has the potential to work on most of the crud elements specifically if the value is an object or an array
async function dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn) {
    let from = await dndCrudData(draggedEl, draggedFrom, "remove");
    let to = await dndCrudData(droppedEl, droppedIn, "add");

    if (from && to && !draggedFrom.isSameNode(droppedIn)) {
        let element = getDataElements(from.data);
        if (!element.length) return;

        if (!element.includes(droppedIn)) {
            if (from.keyPath.includes(".")) {
                let test = { [from.keyPath]: undefined };

                from.clonedParentData = dotNotationToObject(test, from.clonedParentData);
                dndCrudSend(from.clonedParentData, "update");
            } else {
                const index = from.keyPath.match(/\[(\d+)\]/);
                let removeData = from.clonedParentData[from.clonedParentData.type].splice(
                    index,
                    1
                )[0];
                if (removeData) {
                    removeData.type = from.clonedParentData.type;
                    removeData[removeData.type] = removeData;
                    dndCrudSend(removeData, "delete");
                }

                if (from.clonedParentData[from.clonedParentData.type].length)
                    dndCrudSend(from.clonedParentData, "update");
            }
        }
    }

    if (to) dndCrudSend(to.clonedParentData, "update");
}

async function dndCrudData(element, parent, operator) {
    if (!elements.has(parent)) return;
    let data = await parent.getData();
    let clonedParentData = getObject(parent);

    let { dragData, sortName, sortDirection, keyPath, clones, index } = dndNewData(
        element,
        data
    );
    clonedParentData[clonedParentData.type] = [];

    if (sortName) {
        for (let i = 0; i < clones.length; i++) {
            if (i > index) {
                let previousData = data[data.type][index];
                dragData[sortName] = operator === "add" ? i + 1 : i - 1;

                clonedParentData[clonedParentData.type].push({ ...previousData, ...dragData });
            }
        }
    } else {
        clonedParentData[clonedParentData.type] = [{ ...data[data.type][index], ...dragData }];
    }

    return { data, clonedParentData, keyPath, clones, index };
}

function dndNewData(element, data) {
    let dragData = {};
    if (data.$filter.query) {
        dndNewDataUpdate(dragData, data.$filter.query);
    }

    let sortName, sortDirection;
    let sort = data.$filter.sort;
    if (sort && sort.length) {
        for (let i = sort.length - 1; i >= 0; i--) {
            if (typeof data[sort.key] === "number") {
                sortName = sort.key;
                sortDirection = sort.direction;
                break;
            }
        }
    }

    let keyPath, clonesMap, clones, index;

    let renderedNode = renderedNodes.get(element);
    if (renderedNode) {
        keyPath = renderedNode.keyPath;
        clonesMap = renderedNode.template.clones;
        clones = Array.from(clonesMap.values());
        index = clones.indexOf(element);
    }

    return { dragData, sortName, sortDirection, keyPath, clones, index };
}

function dndNewDataUpdate(dragData, query) {
    for (let key of Object.keys(query)) {
        if (key === "$and" || key === "$or" || key === "$nor") {
            for (let i = 0; i < query[key].length; i++) {
                dndNewDataUpdate(dragData, query[key][i]);
            }
        } else if (
            typeof query[key] === "object" &&
            !Array.isArray(query[key])
        ) {
            if (query[key].$eq) dragData[key] = query[key].$eq;
            if (query[key].$ne) dragData[key] = query[key].$ne;
        } else {
            dragData[key] = query[key];
        }
    }
}

function dndCrudSend(data, crudType) {
    if (CRUD) {
        let action = data.type;
        action = action.charAt(0).toUpperCase() + action.slice(1);
        CRUD[crudType + action](data);
    } else console.log("dnd reordered data set as crud is unavailable");
}

Observer.init({
    name: "CoCreateElementsChildList",
    types: ["addedNodes"],
    selector: selector,
    callback: function (mutation) {
        init([mutation.target]);
    }
});

Observer.init({
    name: "CoCreateElementsRemovedNodes",
    types: ["removedNodes"],
    selector: selector,
    callback: function (mutation) {
        if (mutation.target.hasAttribute("render-clone")) return;
        remove(mutation.target);
    }
});

Observer.init({
    name: "CoCreateElementsAttributes",
    types: ["attributes"],
    attributeFilter: [
        "organization_id",
        "host",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key"
    ],
    // target: selector, // blocks mutations when applied
    callback: function (mutation) {
        let currentValue = mutation.target.getAttribute(mutation.attributeName);
        if (currentValue !== mutation.oldValue) {
            if (mutation.target.tagName === "FORM") return;
            remove(mutation.target);
            init([mutation.target]);
        }
    }
});

Actions.init([
    {
        name: "save",
        endEvent: "saved",
        callback: (action) => {
            if ((action.form, action)) save(action.form, action);
        }
    },
    {
        name: "delete",
        endEvent: "deleted",
        callback: async (action) => {
            // TODO: use selector to target elements for deletion if element is apart of render get render get rendering element for more crud detils
            // this way any selector can be used to target crud deletions not just .selected
            let elements = [];
            if (action.element.hasAttribute("delete-query")) {
                elements = queryElements({
                    element: action.element,
                    prefix: "delete"
                });
            } else {
                elements = [action.element];
            }

            for (let i = 0; i < elements.length; i++) {
                const data = getObject(elements[i]);
                if (!data) return;
                data.method = data.type + ".delete";

                if (elements[i].renderValue) {
                    let selected = elements[i].querySelectorAll(".selected");
                    data[data.type] = [];
                    for (let j = 0; j < selected.length; j++) {
                        let attribute = selected[j].getAttribute(data.type);
                        if (attribute) {
                            attribute = attribute.split(",");
                            for (let k = 0; k < attribute.length; k++) {
                                if (data.type === "object")
                                    data[data.type].push({ _id: attribute[k] });
                                else {
                                    data[data.type].push(attribute[k]);
                                }
                            }
                        }
                    }
                } else if (
                    data.type === "object" &&
                    typeof data[data.type] === "string"
                )
                    data[data.type] = { _id: data[data.type] };

                let response = await CRUD.send(data);
                action.element.dispatchEvent(
                    new CustomEvent("deleted", {
                        detail: response
                    })
                );
            }
        }
    }
]);

init();

export default {
    init,
    read,
    save,
    getData,
    getObject,
    reset,
    elements,
    keys,
    forms,
    debounce,
    getAttributes,
    setTypeValue
};
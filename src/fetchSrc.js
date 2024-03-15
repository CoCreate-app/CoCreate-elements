import observer from '@cocreate/observer';

const selector = '[src]:not(img, video, audio, script, input, iframe, frame, link, source), [source], [stream]'
const initializing = new Map();


function init(elements) {
    if (elements && !Array.isArray(elements))
        elements = [elements]

    if (!elements)
        elements = document.querySelectorAll(selector);

    initElements(elements);
};

async function initElements(elements) {
    for (let element of elements) {
        let src = element.getAttribute('src') || element.getAttribute('source') || element.getAttribute('stream');

        if (!src || /{{\s*([\w\W]+)\s*}}/g.test(src))
            return;

        let initialize = initializing.get(element)
        if (!initialize || initialize.src != src) {
            initializing.set(element, { src });
            if (src) {
                try {
                    let response = await fetch(src);
                    if (element.tagName === 'AUDIO' || element.tagName === 'VIDEO') {
                        try {
                            let mediaConfig = await response.json();
                            let sourceBuffer;

                            const mediaSource = new MediaSource();
                            video.src = URL.createObjectURL(mediaSource);
                            mediaSource.addEventListener('sourceopen', async () => {
                                const contentType = response.headers.get("Content-Type");
                                sourceBuffer = mediaSource.addSourceBuffer(contentType);

                                sourceBuffer.addEventListener('updateend', () => {
                                    if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
                                        mediaSource.endOfStream();

                                        video.addEventListener('ended', () => {
                                            URL.revokeObjectURL(video.src);
                                        });
                                    }
                                });
                            });

                            // Event listener for seeking
                            element.addEventListener('seeking', () => {
                                let currentTime = element.currentTime;
                                let chunkIndex = Math.floor(currentTime / chunkDuration);

                            });

                            // Event listener for seeked
                            element.addEventListener('seeked', () => {
                                let currentTime = element.currentTime;
                                if (isBuffered(element, currentTime))
                                    return

                                let query = {
                                    "start": { $lte: currentTime },
                                    "end": { $gte: currentTime }
                                };

                                let segments = queryData(mediaConfig.segments, query);
                                for (let segment of segments) {
                                    getSegment(sourceBuffer, segment)
                                }
                            });

                            element.addEventListener('timeupdate', function () {
                                const bufferEnd = video.buffered.end(0);
                                const currentTime = video.currentTime;
                                const threshold = 10; // seconds before buffer end to fetch the next segment

                                if (bufferEnd - currentTime < threshold) {
                                    // Time to fetch the next segment
                                    getSegment(sourceBuffer, mediaConfig)
                                }
                            });
                        } catch (error) {
                            video.src = src
                            // let blob = await response.json();
                            // URL.createObjectURL(blob);
                        }
                    } else {
                        let text = await response.text();
                        if (text) {
                            let path = element.getAttribute('path')
                            if (path)
                                text = text.replaceAll('{{path}}', path)
                            element.setValue(text);
                            initializing.delete(element)
                        }
                    }
                } catch (err) {
                    console.log('FetchSrc error:' + err);
                }
            }
        }
    }
};

async function getSegment(sourceBuffer, segmentConfig) {
    // TODO: use socket/crud/file with room using the url to get one or more segments and append
    let segments = []

    if (segmentConfig.array && segmentConfig.object) {
        let data = { method: 'object.read', ...segmentConfig }
        data = await crud.send(data)
        if (segmentConfig.key) {
            // TODO: utils.getValuefromObject
            if (Array.isArray(data.object[0][key]))
                segments.push(...data.object[0][key])
            else
                segments.push(data.object[0][key])
        } else
            segments.push(...data.object)
    } else if (segmentConfig.src) {
        data = await fetch(src);
    }
    appendSegment(sourceBuffer, segment)
}

async function appendSegment(sourceBuffer, segment) {
    let arrayBuffer = segment.src
    if (typeof segment.src === 'string') {
        try {
            arrayBuffer = base64ToArrayBuffer(segment.src);
        } catch (e) {
            console.error("Base64 decode error:", e);
        }
    } else if (segment.src instanceof ArrayBuffer) {
        arrayBuffer = segment.src
    } else if (segment.src instanceof Blob) {
        arrayBuffer = await segment.src.arrayBuffer();
    } else {
        console.error("Unhandled segment data type");
    }

    // Wait for the source buffer to be ready for updates
    if (sourceBuffer.updating) await new Promise(resolve => sourceBuffer.addEventListener('updateend', resolve, { once: true }));

    sourceBuffer.appendBuffer(arrayBuffer);
}

function isBuffered(element, currentTime) {
    for (let i = 0; i < element.buffered.length; i++) {
        if (currentTime >= element.buffered.start(i) && currentTime <= element.buffered.end(i)) {
            return true; // The currentTime is within a buffered range
        }
    }
    return false; // The currentTime is not buffered
}

function base64ToBlob(base64, contentType = '') {
    const binaryString = atob(base64.split(',')[1]);
    const len = binaryString.length;
    const uint8Array = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    return new Blob([uint8Array], { type: contentType });
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64.split(',')[1]); // Decode base64
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer; // Return ArrayBuffer
}

observer.init({
    name: 'CoCreateSrc',
    observe: ['addedNodes'],
    target: selector,
    callback: function (mutation) {
        init(mutation.target);
    }
});

observer.init({
    name: 'CoCreateSrcAttributes',
    observe: ['attributes'],
    attributeName: ['src'],
    target: selector,
    callback: function (mutation) {
        init(mutation.target);
    }
});

init()

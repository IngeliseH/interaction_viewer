export function createSvgElement(tag, attributes = {}, textContent = '') {
    const svgNS = "http://www.w3.org/2000/svg";
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    if (textContent) {
        element.textContent = textContent;
    }
    return element;
}

export function createProteinLengthLabel(value, x, y, textAnchor = "middle") {
    const label = createSvgElement("text", {
        "x": x,
        "y": y,
        "dy": "0.35em",
        "text-anchor": textAnchor,
        "font-size": "12px",
        "fill": "#333"
    });
    label.textContent = value.toString();
    return label;
}

export function createHoverLabel(value, x, y, textAnchor = "middle") {
    const label = createSvgElement("text", {
        "x": x,
        "y": y,
        "dy": "0.35em",
        "text-anchor": textAnchor,
        "font-size": "10px",
        "fill": "#333",
        "visibility": "hidden"
    });
    label.textContent = value.toString();
    return label;
}
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

export function createProteinLabel(text, x, y, angle = 0, fontSize = '13') {
    const label = createSvgElement('text', {
        'x': x,
        'y': y,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': fontSize
    }, text);
    
    if (angle !== 0) {
        label.setAttribute('transform', `rotate(${angle} ${x} ${y})`);
    }
    
    return label;
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

export function createArcPath(startAngle, endAngle, innerRadius, outerRadius) {
    const segStartRad = startAngle * Math.PI / 180;
    const segEndRad = endAngle * Math.PI / 180;
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    const x1 = Math.cos(segStartRad) * outerRadius;
    const y1 = Math.sin(segStartRad) * outerRadius;
    const x2 = Math.cos(segEndRad) * outerRadius;
    const y2 = Math.sin(segEndRad) * outerRadius;
    const x3 = Math.cos(segEndRad) * innerRadius;
    const y3 = Math.sin(segEndRad) * innerRadius;
    const x4 = Math.cos(segStartRad) * innerRadius;
    const y4 = Math.sin(segStartRad) * innerRadius;

    return createSvgElement('path', {
        'd': `M ${x1} ${y1}
        A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
        Z`
    });
}

export function createChordPath(startPoints, endPoints, controlPoint) {
    const [x1s, y1s] = startPoints[0];
    const [x1e, y1e] = startPoints[1];
    const [x2s, y2s] = endPoints[0];
    const [x2e, y2e] = endPoints[1];
    const [cx, cy] = controlPoint;

    return createSvgElement('path', {
        'd': `M ${x1s} ${y1s}
        Q ${cx} ${cy} ${x2e} ${y2e}
        L ${x2s} ${y2s}
        Q ${cx} ${cy} ${x1e} ${y1e}
        Z`
    });
}

export function createGradient(id, x1, y1, x2, y2, color1, color2) {
    const gradient = createSvgElement('linearGradient', {
        'id': id,
        'gradientUnits': 'userSpaceOnUse',
        'x1': x1,
        'y1': y1,
        'x2': x2,
        'y2': y2
    });

    const stop1 = createSvgElement('stop', {
        'offset': '0%',
        'stop-color': color1
    });

    const stop2 = createSvgElement('stop', {
        'offset': '100%',
        'stop-color': color2
    });

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    
    return gradient;
}

export function setupHoverInteraction(path, labels) {
    path.addEventListener('mouseover', () => {
        path.setAttribute('opacity', '0.85');
        labels.forEach(label => label.setAttribute('visibility', 'visible'));
    });
    
    path.addEventListener('mouseout', () => {
        path.setAttribute('opacity', '0.5');
        labels.forEach(label => label.setAttribute('visibility', 'hidden'));
    });
}

export function getArcAngles(names, seqLens, options = {}) {
    const { padAngle = 2, queryProtein = null, expandQuery = false } = options;
    const angles = {};
    let currentAngle = 0;

    let namesOrdered = [...names];
    if (queryProtein && names.length > 1 && names.includes(queryProtein)) {
        namesOrdered = [queryProtein, ...names.filter(n => n !== queryProtein)];
    }

    let arcFractions = {};
    if (expandQuery && queryProtein && namesOrdered[0] === queryProtein && namesOrdered.length > 1) {
        arcFractions[queryProtein] = 0.6;
        const rest = 1 - arcFractions[queryProtein];
        const nOthers = namesOrdered.length - 1;
        namesOrdered.slice(1).forEach(name => {
            arcFractions[name] = rest / nOthers;
        });
    } else {
        const totalLen = Object.values(seqLens).reduce((sum, len) => sum + len, 0);
        namesOrdered.forEach(name => {
            arcFractions[name] = seqLens[name] / totalLen;
        });
    }

    let angleOffset = 0;
    if (queryProtein && namesOrdered[0] === queryProtein) {
        const arcSpan = arcFractions[queryProtein] * (360 - padAngle * names.length);
        angleOffset = -90 - arcSpan / 2;
    }

    currentAngle = angleOffset;
    namesOrdered.forEach(name => {
        const span = arcFractions[name] * (360 - padAngle * names.length);
        angles[name] = {
            start: currentAngle,
            end: currentAngle + span
        };
        currentAngle += span + padAngle;
    });

    return { angles, namesOrdered };
}

export function setupDomainHoverInteraction(segPath, hoverLabel, parentGroup) {
    segPath.addEventListener('mouseover', () => {
        segPath.setAttribute('opacity', '1.0');
        hoverLabel.setAttribute('visibility', 'visible');
        parentGroup.appendChild(hoverLabel);
    });

    segPath.addEventListener('mouseout', () => {
        segPath.setAttribute('opacity', '0.6');
        hoverLabel.setAttribute('visibility', 'hidden');
    });
}

export function createChordStyle() {
    const style = createSvgElement('style');
    style.textContent = `
        .chord-shape:hover {
            cursor: pointer;
            opacity: 0.85 !important;
        }
        svg, svg * {
            cursor: default !important;
        }
    `;
    style.id = 'chord-plot-style';
    return style;
}

export function createChordGroup(startPoints, endPoints, controlPoint, color, opacity = 0.5) {
    const path = createChordPath(startPoints, endPoints, controlPoint);
    path.setAttribute('fill', color);
    path.setAttribute('opacity', opacity);
    path.setAttribute('stroke', 'none');
    path.classList.add('chord-shape');
    return path;
}

export function createLabelGroup(angles, arcInner, minLabelAngle = 8) {
    const { pos1Start, pos1End, pos2Start, pos2End } = angles;
    
    let label1StartAngle = pos1Start, label1EndAngle = pos1End;
    if (Math.abs(pos1End - pos1Start) < minLabelAngle) {
        const mid = (pos1Start + pos1End) / 2;
        label1StartAngle = mid - minLabelAngle / 2;
        label1EndAngle = mid + minLabelAngle / 2;
    }
    
    let label2StartAngle = pos2Start, label2EndAngle = pos2End;
    if (Math.abs(pos2End - pos2Start) < minLabelAngle) {
        const mid = (pos2Start + pos2End) / 2;
        label2StartAngle = mid - minLabelAngle / 2;
        label2EndAngle = mid + minLabelAngle / 2;
    }
    
    return { label1StartAngle, label1EndAngle, label2StartAngle, label2EndAngle };
}

export function calculateChordAngles(protein1, protein2, res1, res2, angles, seqLens) {
    const angle1 = angles[protein1];
    const angle2 = angles[protein2];
    
    const arcSpan1 = angle1.end - angle1.start;
    const arcSpan2 = angle2.end - angle2.start;
    
    return {
        pos1Start: angle1.start + ((res1[0] / seqLens[protein1]) * arcSpan1),
        pos1End: angle1.start + ((res1[1] / seqLens[protein1]) * arcSpan1),
        pos2Start: angle2.start + ((res2[0] / seqLens[protein2]) * arcSpan2),
        pos2End: angle2.start + ((res2[1] / seqLens[protein2]) * arcSpan2)
    };
}

export function createDomainPath(domain, start, end, seqLen, arcInner, arcOuter, baseColor = '#cccccc') {
    const dStart = Math.max(1, domain.start);
    const dEnd = Math.min(seqLen, domain.end);
    if (dEnd < dStart) return null;

    const arcSpan = end - start;
    const denominator = seqLen > 1 ? seqLen - 1 : 1;
    const segStart = start + ((dStart - 1) / denominator) * arcSpan;
    const segEnd = start + ((dEnd - 1) / denominator) * arcSpan;

    const segPath = createArcPath(segStart, segEnd, arcInner, arcOuter);
    const segColor = domain.type === 'alphafold' ? '#8ecae6' : 
        (window.domainPlot_domainBaseIdToColor?.[domain.id?.replace(/_\d+$/, '').replace(/_/g, ' ')] || baseColor);
    
    segPath.setAttribute('fill', segColor);
    segPath.setAttribute('opacity', '0.6');
    
    return { path: segPath, start: segStart, end: segEnd };
}

﻿/// <reference path="../../_references.ts"/>

module powerbi.visuals.experimental {
    import EnumExtensions = jsCommon.EnumExtensions;

    export class Domain {
        public min: number;
        public max: number;

        constructor(min: number = 0, max: number = 0) {
            this.setDomain(min, max);
        }

        public setDomain(min: number = 0, max: number = 0): void {
            this.min = min;
            this.max = max;
        }

        public toArray(): number[] {
            return [this.min, this.max];
        }

        public intersect(other: Domain): Domain {
            let min = Math.max(this.min, other.min);
            let max = Math.min(this.max, other.max);

            if (max > min)
                return new Domain(min, max);
        }

        public range(): number {
            return this.max - this.min;
        }

        public static createFromValues(values: number[]): Domain {
            let min = d3.min(values);
            let max = d3.max(values);
            return new Domain(min, max);
        }

        public static createFromNestedValues<TOuter>(values: TOuter[], unpack: (p: TOuter) => number[]): Domain {
            let min = d3.min(values, (v) => d3.min(unpack(v)));
            let max = d3.max(values, (v) => d3.max(unpack(v)));
            return new Domain(min, max);
        }

        public static fromArray(minMax: number[]): Domain {
            debug.assert(minMax.length === 2, "expected 2 element array");
            return new Domain(minMax[0], minMax[1]);
        }

        public static createOrdinal(count: number): Domain {
            return new Domain(0, count);
        }

        public static maxExtents(domains: Domain[]): Domain {
            let min: number;
            let max: number;
            for (let domain of domains) {
                if (min == null || domain.min < min)
                    min = domain.min;
                if (max == null || domain.max > max)
                    max = domain.max;
            }
            
            return new Domain(min, max);
        }

        public static intersect(domains: Domain[]): Domain {
            debug.assert(!_.isEmpty(domains), "must intersect at least 1 domain");
            let intersection: Domain = domains[0];
            for (let i = 1; i < domains.length; i++) {
                intersection = intersection.intersect(domains[i]);
                if (intersection == null)
                    return;
            }

            return intersection;
        }
    }

    export module cartesian {

        module viewModels {
            export interface CartesianAxesViewModel {
                viewport: IViewport;
                margin: IMargin;
            }
        }

        module models {
            export interface AxisData {
                /** the data domain. [min, max] for a scalar axis, or [1...n] index array for ordinal */
                dataDomain: number[];
                /** the DataViewMetadataColumn will be used for dataType and tick value formatting */
                metaDataColumn: DataViewMetadataColumn;
                /** identifies the property for the format string */
                formatStringProp: DataViewObjectPropertyIdentifier;
                /** if true and the dataType is numeric or dateTime, create a linear axis, else create an ordinal axis */
                isScalar?: boolean;
            };

            export interface CartesianAxesData {
                forcedXDomain?: Domain;
                forcedY1Domain?: Domain;
                forcedY2Domain?: Domain;
                //forcedTickCount?: number;
                forceValueAxisMerge: boolean;
                categoryAxisScaleType: string;
                y1AxisScaleType: string;
                y2AxisScaleType: string;
                showY1Axis: boolean;
                showY2Axis: boolean;
                showCategoryAxis: boolean;
                showCategoryAxisTitle: boolean;
                showValueAxisTitle: boolean;
                secShowValueAxisTitle: boolean;
                showValueAxisOnRight: boolean;
                isScalar: boolean;
            }
        }

        export interface CartesianAxisProperties {
            x: IAxisProperties;
            y1: IAxisProperties;
            y2?: IAxisProperties;
        }

        export interface IAxisProperties {
            /** 
             * The D3 Scale object.
             */
            scale: D3.Scale.GenericScale<any>;
            /** 
             * The D3 Axis object.
             */
            axis: D3.Svg.Axis;
            /**
             * An array of the tick values to display for this axis.
             */
            values: any[];
            maxLabelWidth: number;
            /** 
             * The D3.Selection that the axis should render to.
             */
            //graphicsContext?: D3.Selection;
            /** 
             * The ValueType of the column used for this axis.
             */
            axisType: ValueType;
            /**
             * A formatter with appropriate properties configured for this field.
             */
            formatter: IValueFormatter;
            /**
             * The axis title label.
             */
            axisLabel: string;
            /**
             * Cartesian axes are either a category or value axis.
             */
            isCategoryAxis: boolean;
            /** 
             * (optional) The max width for category tick label values. used for ellipsis truncation / label rotation.
             */
            xLabelMaxWidth?: number;
            /** 
             * (optional) The thickness of each category on the axis.
             */
            categoryThickness?: number;
            /** 
             * (optional) The outer padding in pixels applied to the D3 scale.
             */
            outerPadding?: number;
            /** 
             * (optional) Whether we are using a default domain.
             */
            usingDefaultDomain?: boolean;
            /** (optional) do default d3 axis labels fit? */
            willLabelsFit?: boolean;
            /** (optional) word break axis labels */
            willLabelsWordBreak?: boolean;
            /** 
             * (optional) Whether log scale is possible on the current domain.
             */
            isLogScaleAllowed?: boolean;
        }

        export interface CartesianAxesInitOptions extends VisualInitOptions {
            axisLinesVisibility: AxisLinesVisibility;
        }

        class CartesianAxesConverter {
            private dataViewHelper: DataViewHelper;
            private objects: DataViewObjects;
            private layers: ICartesianLayer[];

            private properties = {
                categoryAxis: {
                    axisScale: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'axisScale' },
                    end: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'end' },
                    labelColor: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'labelColor' },
                    show: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'show' },
                    start: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'start' },
                    showAxisTitle: <DataViewObjectPropertyIdentifier>{ objectName: 'categoryAxis', propertyName: 'showAxisTitle' },
                },
                valueAxis: {
                    axisScale: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'axisScale' },
                    secAxisScale: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'secAxisScale' },
                    labelColor: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'labelColor' },
                    secShow: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'secShow' },
                    show: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'show' },
                    start: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'start' },
                    end: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'end' },
                    showAxisTitle: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'showAxisTitle' },
                    secShowAxisTitle: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'secShowAxisTitle' },
                    position: <DataViewObjectPropertyIdentifier>{ objectName: 'valueAxis', propertyName: 'position' },
                },
            };

            constructor(dataViews: DataView[], layers: ICartesianLayer[]) {
                this.dataViewHelper = new DataViewHelper(dataViews[0]);
                this.objects = dataViews[0].metadata.objects;
                this.layers = layers;
            }

            public convert(): models.CartesianAxesData {
                let categoryAxisLabelColor = DataViewObjects.getFillColor(this.objects, this.properties.categoryAxis.labelColor);
                let valueAxisLabelColor = DataViewObjects.getFillColor(this.objects, this.properties.valueAxis.labelColor);

                let showCategoryAxis = DataViewObjects.getValue<boolean>(this.objects, this.properties.categoryAxis.show);
                let showY2Axis = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.secShow);
                let showY1Axis = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.show);

                let forceValueAxisMerge = (showY2Axis === false);  // Only force a merge if secShow is explicitly set to false
                let forcedValueAxisStart = DataViewObjects.getValue<number>(this.objects, this.properties.valueAxis.start);
                let forcedValueAxisEnd = DataViewObjects.getValue<number>(this.objects, this.properties.valueAxis.end);
                let forcedValueAxisDomain = new Domain(forcedValueAxisStart, forcedValueAxisEnd);

                let forcedCategoryAxisStart = DataViewObjects.getValue<number>(this.objects, this.properties.categoryAxis.start);
                let forcedCategoryAxisEnd = DataViewObjects.getValue<number>(this.objects, this.properties.categoryAxis.end);
                let forcedCategoryAxisDomain = new Domain(forcedCategoryAxisStart, forcedCategoryAxisEnd);

                let showCategoryAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.categoryAxis.showAxisTitle);
                let showValueAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.showAxisTitle);
                let secShowValueAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.secShowAxisTitle);

                let categoryAxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.categoryAxis.axisScale, axisScale.linear);
                let y1AxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.valueAxis.axisScale, axisScale.linear);
                let y2AxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.valueAxis.secAxisScale, axisScale.linear);

                let valueAxisPosition = DataViewObjects.getValue<string>(this.objects, this.properties.valueAxis.position, yAxisPosition.left);

                let layers = this.layers;
                let isScalar = !_.isEmpty(layers) && layers[0].isScalar();

                return {
                    forcedXDomain: forcedCategoryAxisDomain,
                    forceValueAxisMerge: forceValueAxisMerge,
                    categoryAxisScaleType: categoryAxisScaleType,
                    showCategoryAxis: showCategoryAxis,
                    y1AxisScaleType: y1AxisScaleType,
                    y2AxisScaleType: y2AxisScaleType,
                    showY1Axis: showY1Axis,
                    showY2Axis: !!showY2Axis,
                    forcedY1Domain: forcedValueAxisDomain,
                    showCategoryAxisTitle: showCategoryAxisTitle,
                    showValueAxisTitle: showValueAxisTitle,
                    secShowValueAxisTitle: secShowValueAxisTitle,
                    showValueAxisOnRight: valueAxisPosition === yAxisPosition.right,
                    isScalar: isScalar,
                };
            }
        }

        //export interface ICartesianAxes extends ILayoutable {
        //    xScale: D3.Scale.GenericScale<any>;
        //    y1Scale: D3.Scale.GenericScale<any>;
        //    y2Scale: D3.Scale.GenericScale<any>;
        //    xDomain: Domain;
        //    yDomain: Domain;

        //    getPlotArea(): BoundingBox;
        //    visitLayer(layer: ICartesianLayer): void
        //}

        interface MergedAxisProperties {
            domain: Domain;
            merged: boolean;
            //tickCount: number;
        }

        module constants {
            export const MaxMarginFactor = 0.25;
            export const MinBottomMargin = 25;
            export const TopMargin = 8;
            export const MinOverlapPctToMergeValueAxes = 0.1;
            export const FontSize = 11;
            export const FontSizeString = jsCommon.PixelConverter.toString(constants.FontSize);
            export const TextProperties: TextProperties = {
                fontFamily: 'wf_segoe-ui_normal',
                fontSize: constants.FontSizeString,
            };
            export const XLabelMaxAllowedOverflow = 25;  // TODO: why?
            //export const DefaultTextHeight = 10;
            export const Padding: IMargin = {
                left: 10,
                right: 15,
                bottom: 12,
                top: 0,
            };
        }

        export class CartesianAxes {
            private dataModel: models.CartesianAxesData;
            //private isXScalar: boolean;
            //private categoryDomain: Domain;
            private viewModel: viewModels.CartesianAxesViewModel;
            private initOptions: CartesianAxesInitOptions;
            private renderer: IRenderer;
            private axesNegotiator: AxesNegotiator;
            private layers: ICartesianLayer[];

            private maxMarginFactor: number;

            private scrollY: boolean;
            private scrollX: boolean;
            private showLinesOnX: boolean;
            private showLinesOnY: boolean;

            public xScale: D3.Scale.GenericScale<any>;
            public y1Scale: D3.Scale.GenericScale<any>;
            public y2Scale: D3.Scale.GenericScale<any>;

            public xDomain: Domain;
            public yDomain: Domain;

            public init(options: CartesianAxesInitOptions, layers: ICartesianLayer[]): void {
                let axisLinesVisibility = options.axisLinesVisibility;
                this.showLinesOnX = this.scrollY = EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnBothAxis) ||
                EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnXAxis);

                this.showLinesOnY = this.scrollX = EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnBothAxis) ||
                EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnYAxis);

                this.initOptions = options;
                this.maxMarginFactor = options.style.maxMarginFactor || constants.MaxMarginFactor;

                this.renderer = this.getRenderer(options.preferredRenderer, options.rendererFactory);

                this.layers = layers;
            }

            private getRenderer(type: RendererType, factory: RendererFactory): IRenderer {
                switch (type) {
                    case RendererType.SVG:
                        return new renderers.AxesSvgRenderer(<SvgRenderer>factory.getRenderer(RendererType.SVG), this.showLinesOnX, this.showLinesOnY);
                }
            }

            // TODO: should axes use the data view to compute domain, etc.
            // Or, should it use the data model for the visual? I think the latter.

            public convert(dataViews: DataView[]): void {
                let converter = new CartesianAxesConverter(dataViews, this.layers);

                this.dataModel = converter.convert();
            }

            //private adjustMargins(viewport: IViewport, margin: IMargin, xTicks: boolean, yTicks: boolean): IMargin {
            //    let innerWidth = viewport.width - (margin.left + margin.right);
            //    let innerHeight = viewport.height - (margin.top + margin.bottom);

            //    // Adjust margins if ticks are not going to be shown on either axis
            //    let xAxis = this.element.find('.x.axis');

            //    if (!xTicks && !yTicks) {
            //        margin = {
            //            top: 0,
            //            right: 0,
            //            bottom: 0,
            //            left: 0
            //        };
            //        xAxis.hide();
            //    } else {
            //        xAxis.show();
            //    }

            //    return margin;
            //}

            public getPreferredBoundingBox(bbox: BoundingBox): BoundingBox {
                return <BoundingBox>{
                    top: bbox.top,
                    left: bbox.left,
                    height: bbox.height,
                    width: bbox.width,
                };
            }

            public layout(bbox: BoundingBox, layers: ICartesianLayer[]): SceneGraphNode {
                let dataModel = this.dataModel;
                this.viewModel = this.buildViewModel(this.dataModel, bbox);

                let node = new SceneGraphNode();

                node.render = () => { };

                // TODO: padding/margins?
                // TODO: should range be in absolute pixels or relative? depends on how we use the scale I think.
                //this.xScale = d3.scale.linear()
                //    .range([0, bbox.width])
                //    .domain([xDomain.min, xDomain.max]);

                //this.yScale = d3.scale.linear()
                //    .range([0, bbox.height])
                //    .domain([yDomain.min, yDomain.max]);

                let viewport: IViewport = {
                    width: bbox.width,
                    height: bbox.height,
                };

                let maxMarginFactor = this.maxMarginFactor;
                let maxMargins: IMargin = {
                    left: viewport.width * maxMarginFactor,
                    right: viewport.width * maxMarginFactor,
                    top: 0,
                    bottom: Math.max(constants.MinBottomMargin, Math.ceil(viewport.height * maxMarginFactor))
                }

                let margin: IMargin = {
                    left: 1,
                    right: 0,
                    top: constants.TopMargin,
                    bottom: constants.MinBottomMargin,
                };

                let visualOptions: CalculateScaleAndDomainOptions = {
                    viewport: viewport,
                    margin: margin,
                    forcedXDomain: dataModel.forcedXDomain.toArray(),
                    forceMerge: dataModel.forceValueAxisMerge,
                    showCategoryAxisLabel: false,  // TODO: ??
                    showValueAxisLabel: false,  // TODO: ??
                    categoryAxisScaleType: dataModel.categoryAxisScaleType,
                    valueAxisScaleType: dataModel.y1AxisScaleType,
                };

                let axes = new AxesNegotiator(layers).calculateAxes(visualOptions, dataModel, constants.TextProperties, false, null);

                let renderXAxis = this.shouldRenderAxis(dataModel, axes.x);
                let renderY1Axis = this.shouldRenderAxis(dataModel, axes.y1);
                let renderY2Axis = this.shouldRenderSecondaryAxis(dataModel, axes.y2);

                let innerWidth = viewport.width - (margin.left + margin.right);

                let showY1OnRight = dataModel.showValueAxisOnRight;
                let isScalar = dataModel.isScalar;

                // TODO: preferred plot area?

                let doneWithMargins = false;
                let iteration = 0;
                const maxIterations = 2;
                let tickLabelMargins;
                while (!doneWithMargins && iteration < maxIterations) {
                    iteration++;
                    tickLabelMargins = AxisHelper.getTickLabelMargins(
                        { width: innerWidth, height: viewport.height },
                        maxMargins.left,
                        TextMeasurementService.measureSvgTextWidth,
                        TextMeasurementService.estimateSvgTextHeight,
                        axes,
                        maxMargins.bottom,
                        Prototype.inherit(constants.TextProperties),
                        false,  // this.isXScrollBarVisible || this.isYScrollBarVisible,
                        showY1OnRight,
                        renderXAxis,
                        renderY1Axis,
                        renderY2Axis);

                    // We look at the y axes as main and second sides, if the y axis orientation is right so the main side represents the right side
                    let maxMainYaxisSide = showY1OnRight ? tickLabelMargins.yRight : tickLabelMargins.yLeft,
                        maxSecondYaxisSide = showY1OnRight ? tickLabelMargins.yLeft : tickLabelMargins.yRight,
                        xMax = tickLabelMargins.xMax;
                    // TODO: there is a better way, the visual should communicate that it needs space below the x-axis through ICartesianVisual
                    //if (this.type === CartesianChartType.Play && this.animator)
                    //    xMax += CartesianChart.PlayAxisBottomMargin;

                    maxMainYaxisSide += constants.Padding.left;
                    if ((renderY2Axis && !showY1OnRight) || (showY1OnRight && renderY1Axis))
                        maxSecondYaxisSide += constants.Padding.right;
                    xMax += constants.Padding.bottom;

                    if (this.hideAxisLabels(viewport)) {
                        axes.x.axisLabel = null;
                        axes.y1.axisLabel = null;
                        if (axes.y2) {
                            axes.y2.axisLabel = null;
                        }
                    }

                    this.addUnitTypeToAxisLabel(axes);

                    axisLabels = { x: axes.x.axisLabel, y: axes.y1.axisLabel, y2: axes.y2 ? axes.y2.axisLabel : null };
                    chartHasAxisLabels = (axisLabels.x != null) || (axisLabels.y != null || axisLabels.y2 != null);

                    if (axisLabels.x != null)
                        xMax += CartesianChart.XAxisLabelPadding;
                    if (axisLabels.y != null)
                        maxMainYaxisSide += CartesianChart.YAxisLabelPadding;
                    if (axisLabels.y2 != null)
                        maxSecondYaxisSide += CartesianChart.YAxisLabelPadding;

                    margin.left = showY1OnRight ? maxSecondYaxisSide : maxMainYaxisSide;
                    margin.right = showY1OnRight ? maxMainYaxisSide : maxSecondYaxisSide;
                    margin.bottom = xMax;
                    this.margin = margin;

                    width = viewport.width - (margin.left + margin.right);

                    // re-calculate the axes with the new margins
                    let previousTickCountY1 = axes.y1.values.length;
                    let previousTickCountY2 = axes.y2 && axes.y2.values.length;
                    axes = calculateAxes(this.layers, viewport, margin, this.categoryAxisProperties, this.valueAxisProperties, CartesianChart.TextProperties, this.isXScrollBarVisible || this.isYScrollBarVisible, axes);

                    // the minor padding adjustments could have affected the chosen tick values, which would then need to calculate margins again
                    // e.g. [0,2,4,6,8] vs. [0,5,10] the 10 is wider and needs more margin.
                    if (axes.y1.values.length === previousTickCountY1 && (!axes.y2 || axes.y2.values.length === previousTickCountY2))
                        doneWithMargins = true;
                }

                return node;
            }

            private hideAxisLabels(viewport: IViewport): boolean {
                // TODO: this includes legend height...
                if (this.cartesianSmallViewPortProperties) {
                    if (this.cartesianSmallViewPortProperties.hideAxesOnSmallViewPort && (viewport.height < this.cartesianSmallViewPortProperties.MinHeightAxesVisible) && !this.visualInitOptions.interactivity.isInteractiveLegend) {
                        return true;
                    }
                }
                return false;
            }

            private getMaxTextWidth(labels: string[], textProperties: TextProperties): number {
                let max = 0;
                for (let label of labels) {
                    textProperties.text = label;
                    max = Math.max(max, TextMeasurementService.measureSvgTextWidth(textProperties));
                }

                return max;
            }

            private getTickLabelMargins(
                viewport: IViewport,
                marginLimits: IMargin,
                axes: CartesianAxisProperties,
                textHeight: number,
                scrollbarVisible?: boolean,
                showOnRight?: boolean,
                renderXAxis?: boolean,
                renderY1Axis?: boolean,
                renderY2Axis?: boolean): IMargin {

                debug.assertValue(viewport, 'viewport');

                debug.assertValue(axes, 'axes');
                let xAxisProperties: IAxisProperties = axes.x;
                let y1AxisProperties: IAxisProperties = axes.y1;
                let y2AxisProperties: IAxisProperties = axes.y2;
                debug.assertValue(xAxisProperties, 'xAxis');
                debug.assertValue(y1AxisProperties, 'yAxis');

                let xLabels = xAxisProperties.values;
                let y1Labels = y1AxisProperties.values;

                let margin: IMargin = {
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                };

                let leftOverflow = 0;
                let rightOverflow = 0;
                let maxWidthY1 = 0;
                let maxWidthY2 = 0;
                let bottomMargin = 0;

                // TODO: using outerPadding to indicate lineChart - we need a better way to indicate whether the label has a rectangle or point as a marker
                // half-category width is extra space only caused by rectangles being used to plot a category position, line charts don't have this.
                let labelOffset = xAxisProperties.outerPadding && xAxisProperties.categoryThickness ? xAxisProperties.categoryThickness / 2 : 0;

                let xLabelOuterPadding = 0;
                if (xAxisProperties.outerPadding != null) {
                    xLabelOuterPadding = xAxisProperties.outerPadding;
                }
                else if (xAxisProperties.xLabelMaxWidth != null) {
                    xLabelOuterPadding = Math.max(0, (viewport.width - (xAxisProperties.xLabelMaxWidth * xLabels.length)) / 2);
                }

                if (AxisHelper.getRecommendedNumberOfTicksForXAxis(viewport.width) !== 0
                    || AxisHelper.getRecommendedNumberOfTicksForYAxis(viewport.height) !== 0) {
                    let layoutStrategy;
                    if (scrollbarVisible)
                        layoutStrategy = AxisHelper.LabelLayoutStrategy.DefaultRotationWithScrollbar;
                    else
                        layoutStrategy = AxisHelper.LabelLayoutStrategy.DefaultRotation;

                    if (renderY1Axis) {
                        maxWidthY1 = y1AxisProperties.maxLabelWidth;
                    }

                    if (y2AxisProperties && renderY2Axis) {
                        maxWidthY2 = y2AxisProperties.maxLabelWidth;
                    }

                    let maxNumLines = Math.floor(marginLimits.bottom / textHeight);
                    if (renderXAxis && xLabels.length > 0) {
                        for (let i = 0, len = xLabels.length; i < len; i++) {
                            let height: number;
                            properties.text = xLabels[i];
                            let width = textWidthMeasurer(properties);
                            if (xAxisProperties.willLabelsWordBreak && AxisHelper.isOrdinal(xAxisProperties.axisType)) {
                                // Split label and count rows
                                let wordBreaks = jsCommon.WordBreaker.splitByWidth(properties.text, properties, textWidthMeasurer, xAxisProperties.xLabelMaxWidth, maxNumLines);
                                height = wordBreaks.length * textHeight;
                            }
                            else if (!xAxisProperties.willLabelsFit) {
                                height = width * layoutStrategy.sine;
                                width = width * layoutStrategy.cosine;
                            }
                            else {
                                height = textHeight;
                            }

                            // Account for wide X label (Note: no right overflow when rotated)
                            let overflow = 0;
                            if (i === 0) {
                                if (!xAxisProperties.willLabelsFit /*rotated text*/)
                                    overflow = width - labelOffset - xLabelOuterPadding;
                                else
                                    overflow = (width / 2) - labelOffset - xLabelOuterPadding;
                                leftOverflow = Math.max(leftOverflow, overflow);
                            } else if (i === len - 1 && xAxisProperties.willLabelsFit) {
                                // if we are rotating text (!willLabelsFit) there won't be any right overflow
                                overflow = (width / 2) - labelOffset - xLabelOuterPadding;
                                rightOverflow = Math.max(rightOverflow, overflow);
                            }

                            bottomMargin = Math.max(bottomMargin, height);
                        }
                        // trim any actual overflow to the limit
                        leftOverflow = Math.min(leftOverflow, constants.XLabelMaxAllowedOverflow);
                        rightOverflow = Math.min(rightOverflow, constants.XLabelMaxAllowedOverflow);
                    }
                }

                let rightMargin = 0,
                    leftMargin = 0;

                bottomMargin = Math.min(Math.ceil(bottomMargin), marginLimits.bottom);

                if (showOnRight) {
                    leftMargin = Math.min(Math.max(leftOverflow, maxWidthY2), marginLimits.left);
                    rightMargin = Math.min(Math.max(rightOverflow, maxWidthY1), marginLimits.right);
                }
                else {
                    leftMargin = Math.min(Math.max(leftOverflow, maxWidthY1), marginLimits.left);
                    rightMargin = Math.min(Math.max(rightOverflow, maxWidthY2), marginLimits.right);
                }

                return {
                    top: 0,
                    bottom: Math.ceil(bottomMargin),
                    left: Math.ceil(leftMargin),
                    right: Math.ceil(rightMargin),
                };
            }
            
            private shouldRenderSecondaryAxis(dataModel: models.CartesianAxesData, axisProperties: IAxisProperties): boolean {
                return dataModel.showY2Axis && !_.isEmpty(axisProperties.values);
            }

            private shouldRenderAxis(dataModel: models.CartesianAxesData, axisProperties: IAxisProperties): boolean {
                if (axisProperties.isCategoryAxis)
                    return dataModel.showCategoryAxis && !_.isEmpty(axisProperties.values);
                else
                    return dataModel.showY1Axis && !_.isEmpty(axisProperties.values);
            }

            private buildViewModel(model: models.CartesianAxesData, bbox: BoundingBox): viewModels.CartesianAxesViewModel {


                return <viewModels.CartesianAxesViewModel>{
                    //plotArea: bbox  // TODO: take margins into account
                };
            }

            public getPlotArea(): BoundingBox {
                return {
                    left
                };
            }

            // TODO: remove?
            //public layoutAxes(boundingBox: BoundingBox): IAxisProperties[] {
            //    let models = this.dataModels;

            //    // TODO: not all optionals are set, e.g. getValuefn
            //    let categoryOptions: CreateAxisOptions = {
            //        pixelSpan: boundingBox.width,
            //        dataDomain: models[0].dataDomain,
            //        metaDataColumn: models[0].metaDataColumn,
            //        formatStringProp: models[0].formatStringProp,
            //        outerPadding: 0, //TODO
            //        isCategoryAxis: true,
            //        isScalar: models[0].isScalar,
            //        isVertical: false,
            //        useTickIntervalForDisplayUnits: models[0].isScalar,
            //    };
            //    let valueOptions: CreateAxisOptions = {
            //        pixelSpan: boundingBox.width,
            //        dataDomain: models[1].dataDomain,
            //        metaDataColumn: models[1].metaDataColumn,
            //        formatStringProp: models[1].formatStringProp,
            //        outerPadding: 0, //TODO
            //        isCategoryAxis: false,
            //        isScalar: models[1].isScalar,
            //        isVertical: true,
            //        useTickIntervalForDisplayUnits: true,
            //    };

            //    let catAxisProps = powerbi.visuals.AxisHelper.createAxis(categoryOptions);
            //    let valueAxisProps = powerbi.visuals.AxisHelper.createAxis(valueOptions);

            //    return [catAxisProps, valueAxisProps];
            //}

            public render(options: RenderOptions<viewModels.CartesianAxesViewModel>) {
                let viewModel = options.viewModel;

                //let bottomMarginLimit = this.bottomMarginLimit;
                //let leftRightMarginLimit = this.leftRightMarginLimit;
                //let layers = this.layers;
                //let duration = AnimatorCommon.GetAnimationDuration(this.animator, suppressAnimations);
                //let chartViewport = CartesianChart.getChartViewport(viewport, this.margin);
                //debug.assertValue(layers, 'layers');

                // Filter data that fits viewport
                //if (scrollScale) {
                //    let selected: number[];
                //    let data: CartesianData[] = [];

                //    let startValue = extent[0];
                //    let endValue = extent[1];

                //    let pixelStepSize = scrollScale(1) - scrollScale(0);
                //    let startIndex = Math.floor(startValue / pixelStepSize);
                //    let sliceLength = Math.ceil((endValue - startValue) / pixelStepSize);
                //    let endIndex = startIndex + sliceLength; //intentionally one past the end index for use with slice(start,end)
                //    let domain = scrollScale.domain();

                //    mainAxisScale.domain(domain);
                //    selected = domain.slice(startIndex, endIndex); //up to but not including 'end'
                //    if (selected && selected.length > 0) {
                //        for (let i = 0; i < layers.length; i++) {
                //            data[i] = layers[i].setFilteredData(selected[0], selected[selected.length - 1] + 1);
                //        }
                //        mainAxisScale.domain(selected);

                //        let axisPropsToUpdate: IAxisProperties;
                //        if (this.isXScrollBarVisible) {
                //            axisPropsToUpdate = axes.x;
                //        }
                //        else {
                //            axisPropsToUpdate = axes.y1;
                //        }

                //        axisPropsToUpdate.axis.scale(mainAxisScale);
                //        axisPropsToUpdate.scale(mainAxisScale);

                //        // tick values are indices for ordinal axes
                //        axisPropsToUpdate.axis.ticks(selected.length);
                //        axisPropsToUpdate.axis.tickValues(selected); 

                //        // use the original tick format to format the tick values
                //        let tickFormat = axisPropsToUpdate.axis.tickFormat();
                //        axisPropsToUpdate.values = _.map(selected, (d) => tickFormat(d));
                //    }
                //}

                //hide show x-axis here
                if (viewModel.shouldRenderXAxis) {
                    if (axes.x.isCategoryAxis) {
                        xLabelColor = this.categoryAxisProperties && this.categoryAxisProperties['labelColor'] ? this.categoryAxisProperties['labelColor'] : null;
                    } else {
                        xLabelColor = this.valueAxisProperties && this.valueAxisProperties['labelColor'] ? this.valueAxisProperties['labelColor'] : null;
                    }
                    axes.x.axis.orient("bottom");
                    if (!axes.x.willLabelsFit)
                        axes.x.axis.tickPadding(CartesianChart.TickPaddingRotatedX);

                    let xAxisGraphicsElement = this.xAxisGraphicsContext;
                    if (duration) {
                        xAxisGraphicsElement
                            .transition()
                            .duration(duration)
                            .call(axes.x.axis);
                    }
                    else {
                        xAxisGraphicsElement
                            .call(axes.x.axis);
                    }

                    xAxisGraphicsElement
                        .call(CartesianChart.darkenZeroLine)
                        .call(CartesianChart.setAxisLabelColor, xLabelColor);

                    let xAxisTextNodes = xAxisGraphicsElement.selectAll('text');
                    if (axes.x.willLabelsWordBreak) {
                        xAxisTextNodes
                            .call(AxisHelper.LabelLayoutStrategy.wordBreak, axes.x, bottomMarginLimit);
                    } else {
                        xAxisTextNodes
                            .call(AxisHelper.LabelLayoutStrategy.rotate,
                            bottomMarginLimit,
                            TextMeasurementService.svgEllipsis,
                            !axes.x.willLabelsFit,
                            bottomMarginLimit === tickLabelMargins.xMax,
                            axes.x,
                            this.margin,
                            this.isXScrollBarVisible || this.isYScrollBarVisible);
                    }
                }
                else {
                    this.xAxisGraphicsContext.selectAll('*').remove();
                }

                if (this.shouldRenderAxis(axes.y1)) {
                    if (axes.y1.isCategoryAxis) {
                        yLabelColor = this.categoryAxisProperties && this.categoryAxisProperties['labelColor'] ? this.categoryAxisProperties['labelColor'] : null;
                    } else {
                        yLabelColor = this.valueAxisProperties && this.valueAxisProperties['labelColor'] ? this.valueAxisProperties['labelColor'] : null;
                    }
                    let yAxisOrientation = this.yAxisOrientation;
                    let showY1OnRight = yAxisOrientation === yAxisPosition.right;
                    axes.y1.axis
                        .tickSize(-width)
                        .tickPadding(CartesianChart.TickPaddingY)
                        .orient(yAxisOrientation.toLowerCase());

                    let y1AxisGraphicsElement = this.y1AxisGraphicsContext;
                    if (duration) {
                        y1AxisGraphicsElement
                            .transition()
                            .duration(duration)
                            .call(axes.y1.axis);
                    }
                    else {
                        y1AxisGraphicsElement
                            .call(axes.y1.axis);
                    }

                    y1AxisGraphicsElement
                        .call(CartesianChart.darkenZeroLine)
                        .call(CartesianChart.setAxisLabelColor, yLabelColor);

                    if (tickLabelMargins.yLeft >= leftRightMarginLimit) {
                        y1AxisGraphicsElement.selectAll('text')
                            .call(AxisHelper.LabelLayoutStrategy.clip,
                            // Can't use padding space to render text, so subtract that from available space for ellipses calculations
                            leftRightMarginLimit - CartesianChart.LeftPadding,
                            TextMeasurementService.svgEllipsis);
                    }

                    if (axes.y2 && (!this.valueAxisProperties || this.valueAxisProperties['secShow'] == null || this.valueAxisProperties['secShow'])) {
                        y2LabelColor = this.valueAxisProperties && this.valueAxisProperties['secLabelColor'] ? this.valueAxisProperties['secLabelColor'] : null;

                        axes.y2.axis
                            .tickPadding(CartesianChart.TickPaddingY)
                            .orient(showY1OnRight ? yAxisPosition.left.toLowerCase() : yAxisPosition.right.toLowerCase());

                        if (duration) {
                            this.y2AxisGraphicsContext
                                .transition()
                                .duration(duration)
                                .call(axes.y2.axis);
                        }
                        else {
                            this.y2AxisGraphicsContext
                                .call(axes.y2.axis);
                        }

                        this.y2AxisGraphicsContext
                            .call(CartesianChart.darkenZeroLine)
                            .call(CartesianChart.setAxisLabelColor, y2LabelColor);

                        if (tickLabelMargins.yRight >= leftRightMarginLimit) {
                            this.y2AxisGraphicsContext.selectAll('text')
                                .call(AxisHelper.LabelLayoutStrategy.clip,
                                // Can't use padding space to render text, so subtract that from available space for ellipses calculations
                                leftRightMarginLimit - CartesianChart.RightPadding,
                                TextMeasurementService.svgEllipsis);
                        }
                    }
                    else {
                        this.y2AxisGraphicsContext.selectAll('*').remove();
                    }
                }
                else {
                    this.y1AxisGraphicsContext.selectAll('*').remove();
                    this.y2AxisGraphicsContext.selectAll('*').remove();
                }

                // Axis labels
                //TODO: Add label for second Y axis for combo chart
                if (chartHasAxisLabels) {
                    let hideXAxisTitle = !this.shouldRenderAxis(axes.x, "showAxisTitle");
                    let hideYAxisTitle = !this.shouldRenderAxis(axes.y1, "showAxisTitle");
                    let hideY2AxisTitle = this.valueAxisProperties && this.valueAxisProperties["secShowAxisTitle"] != null && this.valueAxisProperties["secShowAxisTitle"] === false;

                    let renderAxisOptions: AxisRenderingOptions = {
                        axisLabels: axisLabels,
                        legendMargin: this.legendMargins.height,
                        viewport: viewport,
                        hideXAxisTitle: hideXAxisTitle,
                        hideYAxisTitle: hideYAxisTitle,
                        hideY2AxisTitle: hideY2AxisTitle,
                        xLabelColor: xLabelColor,
                        yLabelColor: yLabelColor,
                        y2LabelColor: y2LabelColor
                    };

                    this.renderAxesLabels(renderAxisOptions);
                }
                else {
                    this.axisGraphicsContext.selectAll('.xAxisLabel').remove();
                    this.axisGraphicsContext.selectAll('.yAxisLabel').remove();
                }

                this.translateAxes(viewport);

                //Render chart columns            
                if (this.behavior) {
                    let dataPoints: SelectableDataPoint[] = [];
                    let layerBehaviorOptions: any[] = [];
                    let labelDataPoints: LabelDataPoint[] = [];
                    for (let i = 0, len = layers.length; i < len; i++) {
                        let result = layers[i].render(suppressAnimations);
                        if (result) {
                            dataPoints = dataPoints.concat(result.dataPoints);
                            layerBehaviorOptions.push(result.behaviorOptions);
                            labelDataPoints = labelDataPoints.concat(result.labelDataPoints);
                        }
                    }
                    labelDataPoints = NewDataLabelUtils.removeDuplicates(labelDataPoints);
                    let labelLayout = new LabelLayout({
                        maximumOffset: NewDataLabelUtils.maxLabelOffset,
                        startingOffset: NewDataLabelUtils.startingLabelOffset
                    });
                    let dataLabels = labelLayout.layout(labelDataPoints, chartViewport);
                    if (layers.length > 1) {
                        NewDataLabelUtils.drawLabelBackground(this.labelGraphicsContextScrollable, dataLabels, "#FFFFFF", 0.7);
                    }
                    if (this.animator && !suppressAnimations) {
                        NewDataLabelUtils.animateDefaultLabels(this.labelGraphicsContextScrollable, dataLabels, this.animator.getDuration());
                    }
                    else {
                        NewDataLabelUtils.drawDefaultLabels(this.labelGraphicsContextScrollable, dataLabels);
                    }
                    if (this.interactivityService) {
                        let behaviorOptions: CartesianBehaviorOptions = {
                            layerOptions: layerBehaviorOptions,
                            clearCatcher: this.clearCatcher,
                        };
                        this.interactivityService.bind(dataPoints, this.behavior, behaviorOptions);
                    }
                }
                else {
                    let labelDataPoints: LabelDataPoint[] = [];
                    for (let i = 0, len = layers.length; i < len; i++) {
                        let result = layers[i].render(suppressAnimations);
                        if (result) // Workaround until out of date mobile render path for line chart is removed
                            labelDataPoints = labelDataPoints.concat(result.labelDataPoints);
                    }
                    labelDataPoints = NewDataLabelUtils.removeDuplicates(labelDataPoints);
                    let labelLayout = new LabelLayout({
                        maximumOffset: NewDataLabelUtils.maxLabelOffset,
                        startingOffset: NewDataLabelUtils.startingLabelOffset
                    });
                    let dataLabels = labelLayout.layout(labelDataPoints, chartViewport);
                    if (layers.length > 1) {
                        NewDataLabelUtils.drawLabelBackground(this.labelGraphicsContextScrollable, dataLabels, "#FFFFFF", 0.7);
                    }
                    NewDataLabelUtils.drawDefaultLabels(this.labelGraphicsContextScrollable, dataLabels);
                }
            }

            private static getUnitType(formatter: IValueFormatter) {
                if (formatter &&
                    formatter.displayUnit &&
                    formatter.displayUnit.value > 1)
                    return formatter.displayUnit.title;
            }

            private static addUnitTypeToAxisLabel(axisProperties: CartesianAxisProperties, formatter: IValueFormatter): void {
                let xAxis = axisProperties.x;
                let y1Axis = axisProperties.y1;
                let y2Axis = axisProperties.y2;

                let unitType = CartesianAxes.getUnitType(xAxis.formatter);
                if (xAxis.isCategoryAxis) {
                    this.categoryAxisHasUnitType = unitType !== null;
                }
                else {
                    this.valueAxisHasUnitType = unitType !== null;
                }

                if (xAxis.axisLabel && unitType) {
                    if (xAxis.isCategoryAxis) {
                        xAxis.axisLabel = AxisHelper.createAxisLabel(this.categoryAxisProperties, xAxis.axisLabel, unitType);
                    }
                    else {
                        xAxis.axisLabel = AxisHelper.createAxisLabel(this.valueAxisProperties, xAxis.axisLabel, unitType);
                    }
                }

                unitType = CartesianAxes.getUnitType(y1Axis.formatter);
                if (!y1Axis.isCategoryAxis) {
                    this.valueAxisHasUnitType = unitType !== null;
                }
                else {
                    this.categoryAxisHasUnitType = unitType !== null;
                }

                if (y1Axis.axisLabel && unitType) {
                    if (!y1Axis.isCategoryAxis) {
                        y1Axis.axisLabel = AxisHelper.createAxisLabel(this.valueAxisProperties, y1Axis.axisLabel, unitType);
                    }
                    else {
                        y1Axis.axisLabel = AxisHelper.createAxisLabel(this.categoryAxisProperties, y1Axis.axisLabel, unitType);
                    }
                }

                if (y2Axis) {
                    unitType = CartesianAxes.getUnitType(y2Axis.formatter);
                    this.secValueAxisHasUnitType = unitType !== null;
                    if (y2Axis.axisLabel && unitType) {
                        if (this.valueAxisProperties && this.valueAxisProperties['secAxisStyle']) {
                            if (this.valueAxisProperties['secAxisStyle'] === axisStyle.showBoth) {
                                y2Axis.axisLabel = y2Axis.axisLabel + ' (' + unitType + ')';
                            }
                            else if (this.valueAxisProperties['secAxisStyle'] === axisStyle.showUnitOnly) {
                                y2Axis.axisLabel = unitType;
                            }
                        }
                    }
                }
            }
        }

        class AxesNegotiator {
            private layers: ICartesianLayer[];

            constructor(layers: ICartesianLayer[]) {
                this.layers = layers;
            }

            /** 
             * Computes the Cartesian Chart axes from the set of layers.
             */
            public calculateAxes(
                visualOptions: CalculateScaleAndDomainOptions,
                dataModel: models.CartesianAxesData,
                textProperties: TextProperties,
                scrollbarVisible: boolean,
                existingAxisProperties: CartesianAxisProperties): CartesianAxisProperties {

                let skipMerge = dataModel.showY2Axis;
                let yAxisWillMerge = false;
                let mergeResult: MergedValueAxisResult;
                if (this.hasMultipleYAxes(this.layers) && !skipMerge) {
                    mergeResult = this.tryMergeYDomains(this.layers, visualOptions);
                    yAxisWillMerge = mergeResult.merged;
                    if (yAxisWillMerge) {
                        visualOptions.forcedYDomain = mergeResult.domain;
                    }
                    else {
                        visualOptions.forcedTickCount = mergeResult.tickCount;
                    }
                }

                if (dataModel.forcedY1Domain) {
                    visualOptions.forcedYDomain = AxisHelper.applyCustomizedDomain(dataModel.forcedY1Domain, visualOptions.forcedYDomain);
                }

                let result: CartesianAxisProperties;
                for (let layerNumber = 0, len = this.layers.length; layerNumber < len; layerNumber++) {
                    let currentlayer = this.layers[layerNumber];

                    if (layerNumber === 1 && !yAxisWillMerge) {
                        visualOptions.forcedYDomain = dataModel.forcedY2Domain.toArray();
                        visualOptions.valueAxisScaleType = dataModel.y2AxisScaleType;
                        if (mergeResult && mergeResult.forceStartToZero) {
                            if (!visualOptions.forcedYDomain) {
                                visualOptions.forcedYDomain = [0, undefined];
                            }
                            else if (visualOptions.forcedYDomain[0] == null) {
                                visualOptions.forcedYDomain[0] = 0;//only set when user didn't choose a value
                            }
                        }
                    }
                    visualOptions.showCategoryAxisLabel = dataModel.showCategoryAxisTitle;

                    visualOptions.showValueAxisLabel = this.shouldShowYAxisLabel(layerNumber, dataModel, yAxisWillMerge);

                    let axes = currentlayer.calculateAxesProperties(visualOptions);

                    if (layerNumber === 0) {
                        result = {
                            x: axes[0],
                            y1: axes[1]
                        };
                    }
                    else if (axes && !result.y2) {
                        if (axes[0].axis.scale().domain().length > result.x.axis.scale().domain().length) {
                            visualOptions.showValueAxisLabel = dataModel.showValueAxisTitle;

                            let axes = currentlayer.calculateAxesProperties(visualOptions);
                            // no categories returned for the first layer, use second layer x-axis properties
                            result.x = axes[0];
                            // and 2nd value axis to be the primary
                            result.y1 = axes[1];
                        }
                        else {
                            // make sure all layers use the same x-axis/scale for drawing
                            currentlayer.overrideXScale(result.x);
                            if (!yAxisWillMerge && !axes[1].usingDefaultDomain)
                                result.y2 = axes[1];
                        }
                    }

                    if (existingAxisProperties && existingAxisProperties.x) {
                        result.x.willLabelsFit = existingAxisProperties.x.willLabelsFit;
                        result.x.willLabelsWordBreak = existingAxisProperties.x.willLabelsWordBreak;
                    } else {
                        let viewport = visualOptions.viewport;
                        let margin = visualOptions.margin;
                        let width = viewport.width - (margin.left + margin.right);
                        result.x.willLabelsFit = AxisHelper.LabelLayoutStrategy.willLabelsFit(
                            result.x,
                            width,
                            TextMeasurementService.measureSvgTextWidth,
                            textProperties);

                        // If labels do not fit and we are not scrolling, try word breaking
                        result.x.willLabelsWordBreak = (!result.x.willLabelsFit && !scrollbarVisible) && AxisHelper.LabelLayoutStrategy.willLabelsWordBreak(
                            result.x,
                            margin,
                            width,
                            TextMeasurementService.measureSvgTextWidth,
                            TextMeasurementService.estimateSvgTextHeight,
                            TextMeasurementService.getTailoredTextOrDefault,
                            textProperties);
                    }
                }

                return result;
            }

            private hasMultipleYAxes(layers: ICartesianLayer[]): boolean {
                debug.assertValue(layers, 'layers');

                return layers.length > 1;
            }

            private shouldShowYAxisLabel(layerNumber: number, dataModel: models.CartesianAxesData, yAxisWillMerge: boolean): boolean {
                return ((layerNumber === 0 && dataModel.showValueAxisTitle) ||
                    (layerNumber === 1 && !yAxisWillMerge && dataModel.secShowValueAxisTitle));
            }
        }

        export interface AxisRenderingOptions {
            axisLabels: ChartAxesLabels;
            legendMargin: number;
            viewport: IViewport;
            margin: IMargin;
            hideXAxisTitle: boolean;
            hideYAxisTitle: boolean;
            hideY2AxisTitle?: boolean;
            xLabelColor?: Fill;
            yLabelColor?: Fill;
            y2LabelColor?: Fill;
            labelTextProperties: TextProperties;
            yAxisOrientation: string;
        }

        module renderers {
            module selectors {
                export let axisGroup = jsCommon.CssConstants.createClassAndSelector('axisGroup');
                export let showLinesOnAxis = jsCommon.CssConstants.createClassAndSelector('showLinesOnAxis');
                export let hideLinesOnAxis = jsCommon.CssConstants.createClassAndSelector('hideLinesOnAxis');
                export let cartesianAxes = jsCommon.CssConstants.createClassAndSelector('cartesianAxes');
            }

            export class AxesSvgRenderer {
                private renderer: SvgRenderer;

                private svg: D3.Selection;
                private axisGraphicsContext: D3.Selection;
                private xAxisGraphicsContext: D3.Selection;
                private y1AxisGraphicsContext: D3.Selection;
                private y2AxisGraphicsContext: D3.Selection;
                private clearCatcher: D3.Selection;
                private axisGraphicsContextScrollable: D3.Selection;
                private labelGraphicsContextScrollable: D3.Selection;
                private svgScrollable: D3.Selection;

                constructor(renderer: SvgRenderer, showLinesOnX: boolean, showLinesOnY: boolean) {
                    this.renderer = renderer;

                    let svg = this.svg = this.renderer.getElement(selectors.cartesianAxes);

                    //let svg = svg.append('svg');
                    //svg.style('position', 'absolute');

                    this.axisGraphicsContext = svg.append('g')
                        .classed(selectors.axisGroup.class, true);

                    this.svgScrollable = svg.append('svg')
                        .classed('svgScrollable', true)
                        .style('overflow', 'hidden');

                    this.axisGraphicsContextScrollable = this.svgScrollable.append('g')
                        .classed(selectors.axisGroup.class, true);

                    this.labelGraphicsContextScrollable = this.svgScrollable.append('g')
                        .classed(NewDataLabelUtils.labelGraphicsContextClass.class, true);

                    //if (this.behavior)
                    this.clearCatcher = appendClearCatcher(this.axisGraphicsContextScrollable);

                    let axisGroup = showLinesOnX ? this.axisGraphicsContextScrollable : this.axisGraphicsContext;

                    this.xAxisGraphicsContext = showLinesOnX ? this.axisGraphicsContext.append('g').attr('class', 'x axis') : this.axisGraphicsContextScrollable.append('g').attr('class', 'x axis');
                    this.y1AxisGraphicsContext = axisGroup.append('g').attr('class', 'y axis');
                    this.y2AxisGraphicsContext = axisGroup.append('g').attr('class', 'y axis');

                    this.xAxisGraphicsContext.classed(selectors.showLinesOnAxis.class, showLinesOnX);
                    this.y1AxisGraphicsContext.classed(selectors.showLinesOnAxis.class, showLinesOnY);
                    this.y2AxisGraphicsContext.classed(selectors.showLinesOnAxis.class, showLinesOnY);

                    this.xAxisGraphicsContext.classed(selectors.hideLinesOnAxis.class, !showLinesOnX);
                    this.y1AxisGraphicsContext.classed(selectors.hideLinesOnAxis.class, !showLinesOnY);
                    this.y2AxisGraphicsContext.classed(selectors.hideLinesOnAxis.class, !showLinesOnY);
                }

                public render() {
                    //let svg = this.renderer.getElement();
                }

                private renderAxesLabels(options: AxisRenderingOptions): void {
                    debug.assertValue(options, 'options');
                    debug.assertValue(options.viewport, 'options.viewport');
                    debug.assertValue(options.axisLabels, 'options.axisLabels');

                    this.axisGraphicsContext.selectAll('.xAxisLabel').remove();
                    this.axisGraphicsContext.selectAll('.yAxisLabel').remove();

                    let margin = options.margin;
                    let innerWidth = options.viewport.width - (margin.left + margin.right);
                    let height = options.viewport.height;
                    let innerHeight = height - (margin.top + margin.bottom);

                    let textHeight = TextMeasurementService.estimateSvgTextHeight(options.labelTextProperties);
                    let heightOffset = textHeight;
                    //if (this.type === CartesianChartType.Play && this.animator)
                    //    heightOffset += CartesianChart.PlayAxisBottomMargin;

                    let showOnRight = options.yAxisOrientation === yAxisPosition.right;

                    if (!options.hideXAxisTitle) {
                        let xAxisLabel = this.axisGraphicsContext.append("text")
                            .style("text-anchor", "middle")
                            .text(options.axisLabels.x)
                            .call((text: D3.Selection) => {
                                text.each(function () {
                                    let text = d3.select(this);
                                    text.attr({
                                        "class": "xAxisLabel",
                                        "transform": SVGUtil.translate(innerWidth / 2, height - heightOffset)
                                    });
                                });
                            });

                        xAxisLabel.style("fill", options.xLabelColor ? options.xLabelColor.solid.color : null);

                        xAxisLabel.call(AxisHelper.LabelLayoutStrategy.clip,
                            innerWidth,
                            TextMeasurementService.svgEllipsis);
                    }

                    if (!options.hideYAxisTitle) {
                        let yAxisLabel = this.axisGraphicsContext.append("text")
                            .style("text-anchor", "middle")
                            .text(options.axisLabels.y)
                            .call((text: D3.Selection) => {
                                text.each(function () {
                                    let text = d3.select(this);
                                    text.attr({
                                        "class": "yAxisLabel",
                                        "transform": "rotate(-90)",
                                        "y": showOnRight ? innerWidth + margin.right - textHeight : -margin.left,
                                        "x": -((height - margin.top - options.legendMargin) / 2),
                                        "dy": "1em"
                                    });
                                });
                            });

                        yAxisLabel.style("fill", options.yLabelColor ? options.yLabelColor.solid.color : null);

                        yAxisLabel.call(AxisHelper.LabelLayoutStrategy.clip,
                            innerHeight,
                            TextMeasurementService.svgEllipsis);
                    }

                    if (!options.hideY2AxisTitle && options.axisLabels.y2) {
                        let y2AxisLabel = this.axisGraphicsContext.append("text")
                            .style("text-anchor", "middle")
                            .text(options.axisLabels.y2)
                            .call((text: D3.Selection) => {
                                text.each(function () {
                                    let text = d3.select(this);
                                    text.attr({
                                        "class": "yAxisLabel",
                                        "transform": "rotate(-90)",
                                        "y": showOnRight ? -margin.left : innerWidth + margin.right - textHeight,
                                        "x": -((height - margin.top - options.legendMargin) / 2),
                                        "dy": "1em"
                                    });
                                });
                            });

                        y2AxisLabel.style("fill", options.y2LabelColor ? options.y2LabelColor.solid.color : null);

                        y2AxisLabel.call(AxisHelper.LabelLayoutStrategy.clip,
                            innerHeight,
                            TextMeasurementService.svgEllipsis);
                    }
                }

                // Margin convention: http://bl.ocks.org/mbostock/3019563
                private translateAxes(options: AxisRenderingOptions): void {
                    let viewport = options.viewport;
                    let margin = options.margin;
                    //this.adjustMargins(viewport);

                    let innerWidth = viewport.width - (margin.left + margin.right);
                    let innerHeight = viewport.height - (margin.top + margin.bottom);

                    let showY1OnRight = (options.yAxisOrientation === yAxisPosition.right);

                    this.xAxisGraphicsContext
                        .attr('transform', SVGUtil.translate(0, innerHeight));

                    this.y1AxisGraphicsContext
                        .attr('transform', SVGUtil.translate(showY1OnRight ? innerWidth : 0, 0));

                    this.y2AxisGraphicsContext
                        .attr('transform', SVGUtil.translate(showY1OnRight ? 0 : innerWidth, 0));

                    this.svg.attr({
                        'width': viewport.width,
                        'height': viewport.height
                    });

                    this.svgScrollable.attr({
                        'width': viewport.width,
                        'height': viewport.height
                    });

                    this.svgScrollable.attr({
                        'x': 0
                    });

                    this.axisGraphicsContext.attr('transform', SVGUtil.translate(margin.left, margin.top));
                    this.axisGraphicsContextScrollable.attr('transform', SVGUtil.translate(margin.left, margin.top));
                    this.labelGraphicsContextScrollable.attr('transform', SVGUtil.translate(margin.left, margin.top));

                    if (options.isXScrollBarVisible) {
                        this.svgScrollable.attr({
                            'x': margin.left
                        });
                        this.axisGraphicsContextScrollable.attr('transform', SVGUtil.translate(0, margin.top));
                        this.labelGraphicsContextScrollable.attr('transform', SVGUtil.translate(0, margin.top));
                        this.svgScrollable.attr('width', innerWidth);
                        this.svg.attr('width', viewport.width)
                            .attr('height', viewport.height + CartesianChart.ScrollBarWidth);
                    }
                    else if (options.isYScrollBarVisible) {
                        this.svgScrollable.attr('height', innerHeight + margin.top);
                        this.svg.attr('width', viewport.width + CartesianChart.ScrollBarWidth)
                            .attr('height', viewport.height);
                    }
                }
            }
        }

        interface IRenderer {
            render(viewMode: viewModels.CartesianAxesViewModel);
        }
    }
}
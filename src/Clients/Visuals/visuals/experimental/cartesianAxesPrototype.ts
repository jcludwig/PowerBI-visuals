/// <reference path="../../_references.ts"/>

module powerbi.visuals.experimental.prototype {
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
                showY2Axis: boolean;
                showCategoryAxisTitle: boolean;
                showValueAxisTitle: boolean;
                secShowValueAxisTitle: boolean;
            }
        }

        export interface CartesianAxesInitOptions extends VisualInitOptions {
            axisLinesVisibility: AxisLinesVisibility;
        }

        class CartesianAxesConverter {
            private valueAxisProperties;
            private categoryAxisProperties;

            private dataViewHelper: DataViewHelper;
            private objects: DataViewObjects;

            public properties = {
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
                },
            };

            constructor(dataViews: DataView[]) {
                this.dataViewHelper = new DataViewHelper(dataViews[0]);
                this.objects = dataViews[0].metadata.objects;
            }

            public convert(): models.CartesianAxesData {
                let xLabelColor: string;
                let yLabelColor: string;
                let y2LabelColor: string;

                if (this.shouldRenderXAxis(axes.x)) {
                    if (axes.x.isCategoryAxis) {
                        xLabelColor = DataViewObjects.getFillColor(this.objects, this.properties.categoryAxis.labelColor, "")
                    } else {
                        xLabelColor = DataViewObjects.getFillColor(this.objects, this.properties.valueAxis.labelColor, "");
                    }
                }

                let forcedXMin = DataViewObjects.getValue<number>(this.objects, this.properties.categoryAxis.start, null);
                let forcedXMax = DataViewObjects.getValue<number>(this.objects, this.properties.categoryAxis.end, null);

                // NOTE: default to undefined for default becuase some behavior depends on explicitly set values of true or false.
                let showY2Axis = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.secShow, undefined);
                let forceValueAxisMerge = (showY2Axis === false);  // Only force a merge if secShow is explicitly set to false
                let forcedValueAxisStart = DataViewObjects.getValue<number>(this.objects, this.properties.valueAxis.start, undefined);
                let forcedValueAxisEnd = DataViewObjects.getValue<number>(this.objects, this.properties.valueAxis.end, undefined);
                let forcedValueAxisDomain = new Domain(forcedValueAxisStart, forcedValueAxisEnd);
                let showValueAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.showAxisTitle, false);
                let secShowValueAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.secShowAxisTitle, false);

                let categoryAxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.categoryAxis.axisScale, axisScale.linear);
                let showCategoryAxisTitle = DataViewObjects.getValue<boolean>(this.objects, this.properties.categoryAxis.showAxisTitle, false);
                let y1AxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.valueAxis.axisScale, axisScale.linear);
                let y2AxisScaleType = DataViewObjects.getValue<string>(this.objects, this.properties.valueAxis.secAxisScale, axisScale.linear);

                return {
                    forcedXDomain: new Domain(forcedXMin, forcedXMax),
                    forceValueAxisMerge: forceValueAxisMerge,
                    categoryAxisScaleType: categoryAxisScaleType,
                    y1AxisScaleType: y1AxisScaleType,
                    y2AxisScaleType: y2AxisScaleType,
                    showY2Axis: !!showY2Axis,
                    forcedY1Domain: forcedValueAxisDomain,
                    showCategoryAxisTitle: showCategoryAxisTitle,
                    showValueAxisTitle: showValueAxisTitle,
                    secShowValueAxisTitle: secShowValueAxisTitle,
                };
            }

            private shouldRenderSecondaryAxis(axisProperties: IAxisProperties): boolean {
                return DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.secShow, true) && !_.isEmpty(axisProperties.values);
            }

            private shouldRenderAxis(axisProperties: IAxisProperties): boolean {
                if (axisProperties.isCategoryAxis)
                    return DataViewObjects.getValue<boolean>(this.objects, this.properties.categoryAxis.show, true) && !_.isEmpty(axisProperties.values);
                else
                    return DataViewObjects.getValue<boolean>(this.objects, this.properties.valueAxis.show, true) && !_.isEmpty(axisProperties.values);
            }
        }

        export interface ICartesianAxes extends ILayoutable {
            xScale: D3.Scale.GenericScale<any>;
            y1Scale: D3.Scale.GenericScale<any>;
            y2Scale: D3.Scale.GenericScale<any>;
            xDomain: Domain;
            yDomain: Domain;

            getPlotArea(): BoundingBox;
            visitLayer(layer: ICartesianLayer): void
        }

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
        }

        export class CartesianAxes implements ICartesianAxes {
            private dataModel: models.CartesianAxesData;
            //private isXScalar: boolean;
            //private categoryDomain: Domain;
            private viewModel: viewModels.CartesianAxesViewModel;
            private initOptions: CartesianAxesInitOptions;
            private renderer: IRenderer;
            private axesNegotiator: AxesNegotiator;

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

            public init(options: CartesianAxesInitOptions): void {
                let axisLinesVisibility = options.axisLinesVisibility;
                this.showLinesOnX = this.scrollY = EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnBothAxis) ||
                EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnXAxis);

                this.showLinesOnY = this.scrollX = EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnBothAxis) ||
                EnumExtensions.hasFlag(axisLinesVisibility, AxisLinesVisibility.ShowLinesOnYAxis);

                this.initOptions = options;
                this.maxMarginFactor = options.style.maxMarginFactor || constants.MaxMarginFactor;

                this.renderer = this.getRenderer(options.preferredRenderer, options.rendererFactory);
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
                let converter = new CartesianAxesConverter(dataViews);

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

            public layout(bbox: BoundingBox, xDomain: Domain, yDomain: Domain): SceneGraphNode {
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
                    forcedXDomain: this.dataModel.forcedXDomain.toArray(),
                    forceMerge: this.dataModel.forceValueAxisMerge,
                    showCategoryAxisLabel: false,  // TODO: ??
                    showValueAxisLabel: false,  // TODO: ??
                    categoryAxisScaleType: this.dataModel.categoryAxisScaleType,
                    valueAxisScaleType: this.dataModel.valueAxisScaleType,
                };




                //if (this.type === CartesianChartType.Play && this.animator)
                //    margin.bottom += CartesianChart.PlayAxisBottomMargin;

                return node;
            }

            public visitLayers(layers: ICartesianLayer[]): void {
                new AxesNegotiator(layers).negotiate(this.dataModel);
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

            public negotiate(dataModel: models.CartesianAxesData): CartesianAxisProperties {
                let result: CartesianAxisProperties;

                let mergedAxes = {
                    x: <MergedAxisProperties>undefined,
                    y1: <MergedAxisProperties>undefined,
                    y2: <MergedAxisProperties>undefined,
                };

                let valueAxesTickCount = 0;
                let valueDomainPositive = true;
                for (let layer of this.layers) {
                    let xDomain = layer.getXDomain();
                    let xValues = layer.getXValues();
                    if (xDomain && mergedAxes.x == null) {
                        mergedAxes.x = {
                            domain: xDomain,
                            merged: false,
                            //tickCount: xValues.length,
                        }
                    }

                    let yDomain = layer.getYDomain();
                    let yValues = layer.getYValues();
                    valueAxesTickCount = Math.max(valueAxesTickCount, yValues.length);
                    valueDomainPositive = valueDomainPositive && (yDomain.min >= 0);
                    if (yDomain) {
                        if (mergedAxes.y1 == null) {
                            mergedAxes.y1 = {
                                domain: yDomain,
                                merged: false,
                                //tickCount: yValues.length,
                            }
                        }
                        else {
                            let mergedAxis = this.tryMergeAxes(mergedAxes.y1, yDomain, yValues, dataModel.forceValueAxisMerge);
                            if (mergedAxis.merged) {
                                mergedAxes.y1 = mergedAxis
                                // TODO: max tick count here?
                                // TODO: force axis min to 0?
                            }
                            else {
                                // TODO: what if we already have y2? attempt to merge again?
                                mergedAxes.y2 = mergedAxis
                            }
                            // TODO: set showY2Axis?
                        }
                    }
                }

                //if (yAxisWillMerge) {
                //    //let mergedY1Domain = new Domain(mergeResult.domain[0], mergeResult.domain[1]);
                //    dataModel.forcedY1Domain = Domain.fromArray(AxisHelper.applyCustomizedDomain(dataModel.forcedY1Domain, mergedValueAxis.domain))
                //}

                for (let layerIndex = 0; layerIndex < this.layers.length; layerIndex++) {
                    let layer = this.layers[layerIndex];

                    let valueAxisDomain: Domain;
                    let valueScaleType: string;
                    let showValueAxisLabel: boolean;
                    if (layerIndex > 0 && !yAxisWillMerge) {
                        // use Y2 axis
                        valueAxisDomain = dataModel.forcedY2Domain || new Domain();
                        valueScaleType = dataModel.y2AxisScaleType;
                        if (forceValueAxisStartToZero) {
                            valueAxisDomain.min = 0;
                        }
                        showValueAxisLabel = dataModel.secShowValueAxisTitle;
                    }
                    else {
                        // use Y1 axis
                        valueAxisDomain = dataModel.forcedY1Domain || new Domain();
                        valueScaleType = dataModel.y1AxisScaleType;
                        showValueAxisLabel = dataModel.showValueAxisTitle;
                    }

                    let showCategoryAxisLabel = dataModel.showCategoryAxisTitle;

                    let axesProperties = layer.getAxesProperties();

                    if (layerIndex === 0) {
                        result = {
                            x: axesProperties[0],
                            y1: axesProperties[1],
                        }
                    }
                    else {

                    }
                }
            }

            private allDomainsPositive(domains: Domain[]): boolean {
                return _.all(domains, (domain) => domain.min >= 0);
            }

            private tryMergeAxes(existingAxis: MergedAxisProperties, domain: Domain, values: number[], forceMerge: boolean): MergedAxisProperties {
                let merged: MergedAxisProperties = {
                    domain: existingAxis.domain,
                    merged: false,
                    //tickCount: existingAxis.tickCount,
                };

                // Why modify this when not merging?
                //merged.tickCount = Math.max(merged.tickCount, values.length);

                let mergedDomain = Domain.maxExtents([existingAxis.domain, domain]);

                if (!forceMerge) {
                    // Attempt to merge
                    let range = mergedDomain.range();
                    if (range === 0) {
                        // TODO: weird...
                        return merged;
                    }

                    let intersection = Domain.intersect([existingAxis.domain, domain]);
                    let overlapPct = intersection.range() / range;

                    // Only merge if intersection of domains greater than 10% of total range.
                    if (overlapPct < constants.MinOverlapPctToMergeValueAxes)
                        return merged;
                }

                return {
                    domain: mergedDomain,
                    merged: true,
                    //tickCount: merged.tickCount,
                };
            }

            // TODO: ensure this is correct behavior
            private tryMergeDomains(domains: Domain[], values: number[][], forceMerge: boolean): MergedValueAxisResult {
                //debug.assert(layers.length < 3, 'merging of more than 2 layers is not supported');

                let merged: MergedValueAxisResult = {
                    domain: undefined,
                    merged: false,
                    tickCount: undefined,
                    // TODO: remove
                    forceStartToZero: false
                };

                if (domains.length < 2)
                    return merged;

                //let min: number;
                //let max: number;
                //let minOfMax: number;
                //let maxOfMin: number;

                // TODO: replace full calculateAxesProperties with just a data domain calc
                // we need to be aware of which chart require zero (column/bar) and which don't (line)
                //let domains: Domain[] = _.map(layers, (layer) => layer.getYDomain());

                //let y1props = layers[0].calculateAxesProperties(visualOptions)[1];
                //let y2props = layers[1].calculateAxesProperties(visualOptions)[1];
                //let firstYDomain = y1props.scale.domain();
                //let secondYDomain = y2props.scale.domain();

                //if (_.all(domains, (domain) => domain.min >= 0)) {
                //    // TODO: better name for this? clamped to >= 0?
                //    merged.forceStartToZero = true;
                //}

                //if (firstYDomain[0] >= 0 && secondYDomain[0] >= 0) {
                //    noMerge.forceStartToZero = true;
                //}
                merged.tickCount = _.max(_.map(values, (layer) => layer.length));

                //if (y1props.values && y1props.values.length > 0 && y2props.values && y2props.values.length > 0) {
                //    merged.tickCount = Math.max(y1props.values.length, y2props.values.length);
                //}

                let mergedDomain = Domain.maxExtents(domains);
                //min = Math.min(firstYDomain[0], secondYDomain[0]);
                //max = Math.max(firstYDomain[1], secondYDomain[1]);

                if (!forceMerge) {

                    // If domains don't intersect don't merge axis.
                    //if (firstYDomain[0] > secondYDomain[1] || firstYDomain[1] < secondYDomain[0])
                    //    return noMerge;

                    //maxOfMin = Math.max(firstYDomain[0], secondYDomain[0]);
                    //minOfMax = Math.min(firstYDomain[1], secondYDomain[1]);

                    let range = mergedDomain.range();
                    if (range === 0) {
                        return merged;
                    }

                    let intersection = Domain.intersect(domains);
                    let overlapPct = intersection.range() / range;
                    //let intersection = Math.abs((minOfMax - maxOfMin) / range);

                    // Only merge if intersection of domains greater than 10% of total range.
                    if (overlapPct < constants.MinOverlapPctToMergeValueAxes)
                        return merged;
                }

                return {
                    domain: mergedDomain.toArray(),
                    merged: true,
                    tickCount: merged.tickCount,
                    forceStartToZero: false
                };
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
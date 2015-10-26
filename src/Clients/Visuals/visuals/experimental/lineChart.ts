/// <reference path="../../_references.ts"/>

module powerbi.visuals.experimental {
    import RgbColor = jsCommon.color.RgbColor;

    export module lineChart {

        module models {
        }

        module viewModels {
        }

        module constants {
        }

        export class LineChartVisual implements IVisualComponent {
            private cartesianChart: CartesianChart;

            constructor() {
                let options: CartesianConstructorOptions = {
                    chartType: CartesianChartType.Line,
                    isScrollable: true,
                    animator: new BaseAnimator(),
                    behavior: new CartesianChartBehavior([new LineChartWebBehavior()]),
                    seriesLabelFormattingEnabled: false,
                };
                this.cartesianChart = new CartesianChart(options)
            }

            public init(options: VisualInitOptions): void {
                this.cartesianChart.init(options);
            }

            public setData(dataViews: DataView[]): void {
                this.cartesianChart.onDataChanged({
                    dataViews: dataViews,
                    suppressAnimations: true,
                });
                //this.cartesianChart.setData(dataViews);
            }

            public layout(boundingBox: BoundingBox): SceneGraphNode {
                return this.cartesianChart.layout(boundingBox);
            }
        }

        export class LineChartLayer implements ICartesianVisual {
            init(options: CartesianVisualInitOptions): void {
            }
            setData(dataViews: DataView[]): void;
            calculateAxesProperties(options: CalculateScaleAndDomainOptions): IAxisProperties[];
            overrideXScale(xProperties: IAxisProperties): void;
            render(suppressAnimations: boolean): CartesianVisualRenderResult;
            calculateLegend(): LegendData;
            hasLegend(): boolean;
            onClearSelection(): void;
            enumerateObjectInstances?(enumeration: ObjectEnumerationBuilder, options: EnumerateVisualObjectInstancesOptions): void;
            getVisualCategoryAxisIsScalar?(): boolean;
            getSupportedCategoryAxisType?(): string;
            getPreferredPlotArea?(isScalar: boolean, categoryCount: number, categoryThickness: number): IViewport;
            setFilteredData?(startIndex: number, endIndex: number): CartesianData;
        }

        module renderers {
        }
    }
}
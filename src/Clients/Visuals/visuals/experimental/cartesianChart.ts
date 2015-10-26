module powerbi.visuals.experimental {

    export module cartesian {

        module models {
            export interface CartesianData {
            }
        }

        module viewModels {
            export interface CartesianViewModel {
                boundingBox: BoundingBox;
            }
        }

        export interface ICartesianLayer {
            init(options: VisualInitOptions): void;
            layout(bbox: BoundingBox, axes: CartesianAxes): SceneGraphNode;

            isScalar(): boolean;
        }

        export interface CartesianLayerInitOptions extends VisualInitOptions {

        }

        export class CartesianChart implements IVisualComponent {
            private initOptions: VisualInitOptions;
            private legend: Legend;
            private axes: CartesianAxes;
            private layers: ICartesianLayer[];

            private dataModel: models.CartesianData;

            constructor(layers: ICartesianLayer[]) {
                this.legend = new Legend();
                this.axes = new CartesianAxes();
                this.layers = layers;
            }

            public init(options: VisualInitOptions) {
                this.initOptions = options;
                
                this.legend.init(options);

                for (let layer of this.layers) {
                    layer.init(options);
                }

                let cartesianAxesOpts = <CartesianAxesInitOptions>Prototype.inherit(options, (o: CartesianAxesInitOptions) => {
                    o.axisLinesVisibility = AxisLinesVisibility.ShowLinesOnBothAxis;
                });
                this.axes.init(cartesianAxesOpts, this.layers);
            }

            public layout(boundingBox: BoundingBox): SceneGraphNode {
                // ---- Layout ----
                let layoutManager = new DockLayoutManager(boundingBox);

                let legendPosition = DockPosition.Left;  // TODO: get position from legend?
                let legendBoundingBox = layoutManager.measure(this.legend, legendPosition);
                let axesBoundingBox = layoutManager.measure(this.axes, DockPosition.Fill);

                // ---- Build Scene Graph ----
                let sceneNode = new SceneGraphNode();

                sceneNode.add(this.legend.layout(legendBoundingBox));
                
                sceneNode.add(this.axes.layout(axesBoundingBox));
                let plotArea = this.axes.getPlotArea();

                for (let layer of this.layers) {
                    sceneNode.add(layer.layout(plotArea, this.axes));
                }

                // NOTE: requires axes be laid out first
                // Another option is to separate out the plot area
                let viewModel = this.buildViewModel(this.dataModel, plotArea);
                sceneNode.render = () => this.renderLayers(viewModel);

                return sceneNode;
            }

            private renderLayers(viewModel: viewModels.CartesianViewModel) {
            }

            private buildViewModel(model: models.CartesianData, boundingBox: BoundingBox): viewModels.CartesianViewModel {

                // TODO: may need other axes properties. like what?
                let xScale = this.axes.xScale;
                let y1Scale = this.axes.y1Scale;

                return {
                    boundingBox: boundingBox,
                };
            }

            public setData(dataViews: DataView[]) {
                this.buildDataModel(dataViews, this.initOptions.style.colorPalette.dataColors);

                this.legend.convert(dataViews, this.initOptions.style.colorPalette.dataColors, "", null);
                this.axes.convert(dataViews);
            }

            private buildDataModel(dataViews: DataView[], colorPalette: IDataColorPalette, defaultDataPointColor?: string): void {
                this.dataModel = new CartesianDataConverter(dataViews).convert(colorPalette, defaultDataPointColor);
            }
        }

        class CartesianDataConverter {
            private dataViews: DataView[];

            constructor(dataViews: DataView[]) {
                // ???
            }

            public convert(colorPalette: IDataColorPalette, defaultDataPointColor?: string): models.CartesianData {
                return {};
            }
        }
    }
}
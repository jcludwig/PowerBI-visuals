/*
*  Power BI Visualizations
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved. 
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*   
*  The above copyright notice and this permission notice shall be included in 
*  all copies or substantial portions of the Software.
*   
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/

/// <reference path="../_references.ts"/>

module powerbi.visuals.sampleDataViews {
    export class CsvData extends SampleDataViews {
        private csv: string[][];
        private header: string[];
        private columns: string[][];

        constructor(name: string, lines: string[]) {
            super();

            this.visuals = ['default'];
            this.name = this.displayName = name;

            this.csv = (<any>$).csv.toArrays(lines);
            this.header = this.csv[0];

            // transpose into columns
            this.columns = new Array(this.header.length);
            for (let lineIdx = 1; lineIdx < this.csv.length; lineIdx++) {
                let line = this.csv[lineIdx];
                debug.assert(line.length === this.columns.length, 'every line must have the same number of columns');

                for (let columnIdx = 0; columnIdx < line.length; columnIdx++) {
                    if (lineIdx === 1) {
                        this.columns[columnIdx] = [];
                    }

                    this.columns[columnIdx][lineIdx] = line[columnIdx];
                }
            }
        }

        public getDataViews(): DataView[]{

            let categoryIdx: number;
            let seriesIdx: number;
            let measureIdxs: number[] = [];
            for (let i = 0; i < this.header.length; i++) {
                if (/measure/i.test(this.header[i])) {
                    measureIdxs.push(i);
                }
                else if (/series/i.test(this.header[i])) {
                    debug.assert(seriesIdx == null, 'cannot have more than 1 series');
                    seriesIdx = i;
                }
                else if (/category/i.test(this.header[i])) {
                    debug.assert(categoryIdx == null, 'cannot have more than 1 category');
                    categoryIdx = i;
                }
            }

            // TODO: maybe...
            debug.assert(categoryIdx != null, 'needs exactly one category');
            let dynamicSeries: boolean = (seriesIdx != null);

            let valueMatrix: any[][][] = [];
            let categoryValue2Index: any[] = [];
            let cCategories = 0;

            for (let lineIdx = 1; lineIdx < this.csv.length; lineIdx++) {
                let line = this.csv[lineIdx];

                let categoryValue = line[categoryIdx];
                if (categoryValue2Index[categoryValue] == null) {
                    categoryValue2Index[categoryValue] = cCategories++;
                }

                if (dynamicSeries) {
                    let seriesValue = line[seriesIdx];

                    // build empty arrary
                    if (valueMatrix[seriesValue] == null) {
                        valueMatrix[seriesValue] = [];
                        for (let measureIdx of measureIdxs) {
                            valueMatrix[seriesValue][measureIdx] = [];
                        }
                    }

                    // fill in values for each measure
                    for (let measureIdx of measureIdxs) {
                        valueMatrix[seriesValue][measureIdx][categoryValue2Index[categoryValue]] = line[measureIdx];
                    }
                }
                else {
                    if (valueMatrix[0] == null) {
                        valueMatrix[0] = [];
                        for (let measureIdx of measureIdxs) {
                            valueMatrix[0][measureIdx] = [];
                        }
                    }

                    for (let measureIdx of measureIdxs) {
                        valueMatrix[0][measureIdx][categoryValue2Index[categoryValue]] = line[measureIdx];
                    }
                }
            }

            let metadataColumns: DataViewMetadataColumn[] = [];
            metadataColumns.push(this.createMetadataColumn(this.header[categoryIdx], false, categoryIdx));

            let valueIdentityFields: data.SQExpr[] = [];
            let valuesSource: DataViewMetadataColumn;
            var groupedValueColumns: DataViewValueColumns;
            let valueColumns: DataViewValueColumn[] = [];

            if (dynamicSeries) {
                let seriesColumn: DataViewMetadataColumn = this.createMetadataColumn(this.header[seriesIdx], false, seriesIdx);
                metadataColumns.push(seriesColumn);

                let seriesFieldExpr = powerbi.data.SQExprBuilder.fieldDef({ schema: 's', entity: "table1", column: this.header[seriesIdx] });
                valueIdentityFields.push(seriesFieldExpr);
                valuesSource = seriesColumn;

                // measure columns for each series value
                let seriesValues = Object.keys(valueMatrix);
                for (let seriesValue of seriesValues) {
                    let seriesIdentityExpr = powerbi.data.SQExprBuilder.equal(seriesFieldExpr, powerbi.data.SQExprBuilder.text(seriesValue));

                    for (let measureIdx of measureIdxs) {
                        let metadataColumn = this.createMetadataColumn(this.header[measureIdx], true, measureIdx, seriesValue);
                        metadataColumns.push(metadataColumn);

                        valueColumns.push({
                            source: metadataColumn,
                            values: valueMatrix[seriesValue][measureIdx],
                            identity: powerbi.data.createDataViewScopeIdentity(seriesIdentityExpr),
                        });
                    }
                }

                // measure columns
                for (let measureIdx of measureIdxs) {
                    metadataColumns.push(this.createMetadataColumn(this.header[measureIdx], true, measureIdx));
                }

                groupedValueColumns = powerbi.data.DataViewTransform.createValueColumns(valueColumns, valueIdentityFields, valuesSource);
            }
            else {
                // static series
                for (let measureIdx of measureIdxs) {
                    let metadataColumn = this.createMetadataColumn(this.header[measureIdx], true, measureIdx);
                    metadataColumns.push(metadataColumn);

                    let identityExpr = powerbi.data.SQExprBuilder.fieldDef({ schema: 's', entity: "table1", column: this.header[measureIdx] });

                    valueColumns.push({
                        source: metadataColumn,
                        values: valueMatrix[0][measureIdx],
                        identity: powerbi.data.createDataViewScopeIdentity(identityExpr),
                    });
                }

                groupedValueColumns = powerbi.data.DataViewTransform.createValueColumns(valueColumns);
            }
            
            let categoryValues = Object.keys(categoryValue2Index);
            let categoryFieldExpr = powerbi.data.SQExprBuilder.fieldDef({ schema: 's', entity: "table1", column: this.header[categoryIdx] });
            let categoryIdentities = categoryValues.map(function (value) {
                var expr = powerbi.data.SQExprBuilder.equal(categoryFieldExpr, powerbi.data.SQExprBuilder.text(value));
                return powerbi.data.createDataViewScopeIdentity(expr);
            });

            let categorical = {
                categories: [{
                    source: metadataColumns[0],
                    values: categoryValues,
                    identity: categoryIdentities,
                }],
                values: groupedValueColumns,
            };

            let tableRows = categoryValues.map(function (categoryValue, idx) {
                return [categoryValue].concat(_.map(valueColumns, (v, i) => v.values[idx]));
            });

            let table = {
                columns: metadataColumns,
                rows: tableRows,
            };

            return [{
                metadata: {
                    columns: metadataColumns
                },
                categorical: categorical,
                table: table,
            }];
        }

        private createMetadataColumn(name: string, isMeasure: boolean, index: number, groupName?: string): DataViewMetadataColumn {
            let valueType = isMeasure
                ? powerbi.ValueType.fromDescriptor({ numeric: true })
                : powerbi.ValueType.fromDescriptor({ text: true });

            return {
                displayName: name,
                groupName: groupName,
                isMeasure: isMeasure,
                format: "g",
                queryName: name,
                index: index,
                type: valueType,
            };
        }
    }
}
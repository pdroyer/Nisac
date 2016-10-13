$(document).ready(function(){

    //MAP

    var layerMap = {};
    var popMap = {};

    var baseMap = new ol.layer.Tile({
            source: new ol.source.BingMaps({key: 'Ahj1tKuj8QMFFekEnMUmIgZQRwLDvff8VTz7eMHFsK1r7wIULpcMv9_q-rlT7nIp',
                imagerySet: 'Road'}),
            id: "basemap"
        });

    var getTileLayer = function(url,/*comma separated*/layerIds, visible){
        var layer =  new ol.layer.Tile({
            source: new ol.source.TileArcGISRest({
                url: url,
                params: {"LAYERS": "show:"+layerIds}
            }),
            visible: visible,
            id: layerIds
        });
        return layer;
    };

    var changeExtent = function(extent){
        map.getView().fit(extent, map.getSize());
    };

    var source = new ol.source.Vector();

    //Add all dams to map as features in vector layer
    $.getJSON("http://rdsx.pnl.gov/arcgis/rest/services/nisacModelSimulations/floodlayers_grouped_locations/MapServer/0/query?where=FID+%3E%3D+0&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&relationParam=&outFields=*&returnGeometry=true&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&returnDistinctValues=false&resultOffset=&resultRecordCount=&f=pjson", function(data){
        for(var i in data.features){
            source.addFeature(new ol.Feature({
                geometry: new ol.geom.Point(ol.proj.fromLonLat([data.features[i].geometry.x, data.features[i].geometry.y])),
                data: data.features[i].attributes
            }));
        }
    });

    $.getJSON("timeArrival.json", function(d){
        for(var i in d.data){
            popMap[d.data[i].name] = {"day": d.data[i].day, "night": d.data[i].night};
        }
    });

    var style = new ol.style.Style({
        image: new ol.style.Icon(/** @type {olx.style.IconOptions} */ ({
            src: 'imgs/Dams.svg'
        }))
    });

    var vector = new ol.layer.Vector({
        source: source,
        style: style
    });

    var map = new ol.Map({
        target: "map",
        //controls: ol.control.defaults().extend([
        //    new ol.control.OverviewMap({
        //        className: "ol-overviewmap ol-custom-overviewmap"
        //    })
        //]),
        view: new ol.View({
            center: ol.proj.transform([-96.2167798,36.8681714],"EPSG:4326","EPSG:3857"),
            zoom: 4.5,
            maxZoom: 19
        }),
        layers: [baseMap, vector]
    });

    for(var i = 0; i < 9; i++){
        layerMap[i] = getTileLayer("http://rdsx.pnl.gov/arcgis/rest/services/nisacModelSimulations/FloodArrivalTimesWebMercator/MapServer",i,false);
        map.addLayer(layerMap[i]);
    }

    var displayFeatureInfo = function(pixel) {
        var feature = map.forEachFeatureAtPixel(pixel, function(feature) {
            return feature;
        });
        if (feature) {
            $("#chart").show();
            var dam = feature.getProperties().data;
            $("#damName").text(dam.damId);
            //remove old layers
            for(var k in layerMap){
                map.removeLayer(layerMap[k]);
            }
            //get feature flood layers
            //this query determines which sub layers to query and load
            $.getJSON("http://rdsx.pnl.gov/arcgis/rest/services/nisacModelSimulations/floodlayers_grouped/MapServer?f=pjson", function(data){
                var layerIds;
                for(var j in data.layers){
                    if(data.layers[j].name == dam.damId){
                        layerIds = data.layers[j].subLayerIds;
                    }
                }
                //clear and reset chart
                initializeChart(layerIds.length - 1);//minus one becuase of the half hour layer that cannot effect the domain
                //set pop data in chart
                updateData(popMap[dam.damId]);
                //clear layer map in case it was used
                layerMap = {};
                //load and save layers
                for(var i = 0; i < layerIds.length; i++){
                    //save
                    layerMap[i] = getTileLayer("http://rdsx.pnl.gov/arcgis/rest/services/nisacModelSimulations/floodlayers_grouped/MapServer",layerIds[i],false);
                    //load
                    map.addLayer(layerMap[i]);
                    //set view
                    if(i == layerIds.length - 1){
                        $.getJSON("http://rdsx.pnl.gov/arcgis/rest/services/nisacModelSimulations/floodlayers_grouped/MapServer/"+ layerIds[i] +"?f=pjson", function(layerData){
                            changeExtent(ol.proj.transformExtent([layerData.extent.xmin, layerData.extent.ymin, layerData.extent.xmax, layerData.extent.ymax],"EPSG:4326","EPSG:3857"));
                            map.getView().setZoom(10);
                        });
                    }
                }
            });
        }
    };



    map.on("click", function(e){
        displayFeatureInfo(e.pixel);
    });

    $("#mapReset").on("click", function(e){
         map.getView().setCenter(ol.proj.transform([-96.2167798,36.8681714],"EPSG:4326","EPSG:3857"));
        map.getView().setZoom(4.5);
    });

    //CHART

    var night = [];
    var day = [];
    var allData;

    var chart;
    var margin;
    var width;
    var height;
    var x;
    var yScale;
    var xAxis;
    var yAxis;
    var line;
    var svg;
    var xAx;
    var yAx;
    var content;
    var lineContent;
    var nightLine;
    var dayLine;


    var updateData = function(d){
        console.log(d);
        night = d.night;
        day = d.day;
        allData = night.concat(day);
        update();
    };

    function initializeChart(maxXDomain) {
        //empty
        $("#chart").empty();
        night.length = 0;
        day.length = 0;
        //setup
        chart = d3.select("#chart");
        margin = {top: 40, right: 20, bottom: 90, left: 90};
        width = chart.node().getBoundingClientRect().width - margin.left - margin.right;
        height = chart.node().getBoundingClientRect().height - margin.top - margin.bottom;

        x = d3.scale.linear()
            .domain([0,maxXDomain])
            .range([0, width]);

        yScale = d3.scale.linear()
            .domain([])
            .range([height, 0]);

        xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");


        yAxis = d3.svg.axis()
            .scale(yScale)
            .orient("left")
            .ticks(3);

        line = d3.svg.line()
            .x(function (d) {
                return x(d[0]);
            })
            .y(function (d) {
                return yScale(d[1]);
            })
            .interpolate("cardinal");

        svg = d3.select("#chart").append("svg")
            .attr("width", "100%")
            .attr("height", "100%")
            .style("background","rgba(0,0,0,.85)")
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        var background = svg.append("rect")
            .attr("width", width)
            .attr("height", height)
            .style("fill", "none")
            .style("pointer-events", "all");

        content = svg.append("g");

        lineContent = content.append("g")
            .attr("class","content");

        //content.append("rect")
        //    .attr("width", 150)
        //    .attr("height", height + 50)
        //    .attr("x", -150)
        //    .attr("y",-25)
        //    .style("fill", "white");

        xAx = content.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis);

        //yAx = content.append("g")
        //    .attr("class", "y axis")
        //    .call(yAxis);

        //var yLabel = content.append("text")
        //    .attr("transform", "rotate(-90)")
        //    .attr("y", -60)
        //    .attr("x", -50)
        //    .style({
        //        "text-anchor":"end",
        //        "font-size": "30px"
        //    })
        //    .text("Population at Risk");

        var xLabel = content.append("text")
            .attr("y", height + margin.top * 2)
            .attr("x", width / 2)
            .style({
                "text-anchor":"middle",
                "font-size": "30px",
                "stroke":"#CCCCCC",
                "fill":"white"
            })
            .text("Time After Failure (hrs)");

        var chartTitle = svg.append("g")
            .attr("transform","translate(0,"+ -15 +")")
            .style({
                "stroke":"#cccccc",
                "fill":"#cccccc"
            });

        chartTitle.append("text")
            .text("Population At Risk")
            .style("font-size","24px");

        chartTitle.append("text")
            .text("Night")
            .attr("x",0)
            .attr("y",20);

        chartTitle.append("text")
            .text("Day")
            .attr("x",0)
            .attr("y",40);

        var nightPop = chartTitle.append("text")
            .attr("x",50)
            .attr("y",20)
            .style({
                "stroke":"#cccccc",
                "fill":"#6666FF",
                "stroke-width":.25,
                "shape-rendering": "crispEdges"
            });

        var dayPop = chartTitle.append("text")
            .attr("x",50)
            .attr("y",40)
            .style({
                "stroke":"#cccccc",
                "stroke-width":.25,
                "fill":"orange",
                "shape-rendering": "crispEdges"
            });

        var slider = svg.append("g")
            .attr("class","slider")
            .attr("transform","translate(-10,0)");

        slider.append("rect")
            .attr("x",0)
            .attr("y",0)
            .attr("width", 20)
            .attr("height",height + 10)
            .style({
                "fill":"none",
                "stroke-width":0
            });

        slider.append("line")
            .attr("x1",10)
            .attr("y1",0)
            .attr("x2",10)
            .attr("y2",height)
            .style({
                "fill":"none",
                "stroke":"#CCCCCC",
                "stroke-width":1,
                "stroke-dasharray":"10,10"
            });

        slider.append("polygon")
            .attr("points","10,0 20,10 20,20 0,20 0,10")
            .attr("transform","translate(0,"+ height +")")
            .style({
                "stroke":"#CCCCCC",
                "stroke-width": 2,
                "fill":"#999999",
                "cursor":"pointer"
            })
            .on("mousedown", function(){
                d3.select("body").on("mousemove", function(){
                    var current = d3.transform(slider.attr("transform")).translate[0];
                    //For slider movement
                    slider.attr("transform",function(){
                        if(current + d3.event.movementX >= -10 && current + d3.event.movementX <= (width - 10)){
                            return "translate(" + (current + d3.event.movementX) + ",0)";
                        }
                        else{
                            return "translate(" + current + ",0)";
                        }
                    });
                    //For showing population labels
                    var point = nightLine.node().getPointAtLength(current + 10);
                    if(point.y > height){
                        point.y = height;
                    }
                    var total = Math.round(yScale.invert(point.y));
                    if(total > 0){
                        nightPop.text(total);
                    }
                    else{
                        nightPop.text(0);
                    }
                    point = dayLine.node().getPointAtLength(current + 10);
                    if(point.y > height){
                        point.y = height;
                    }
                    total = Math.round(yScale.invert(point.y));
                    if(total > 0){
                        dayPop.text(total);
                    }
                    else{
                        dayPop.text(0);
                    }
                    //For displaying the layer imagery
                    var slidePos = x.invert(current + 10);
                    if(slidePos > 0 && slidePos < .5){
                        layerMap[0].setVisible(false);
                    }
                    else if(slidePos >= .5 && slidePos < 1){
                        layerMap[0].setVisible(true);
                        layerMap[1].setVisible(false);
                    }
                    else if(slidePos >= 1){
                        layerMap[Math.floor(slidePos)].setVisible(true);
                        if(slidePos < 8){
                            layerMap[Math.floor(slidePos) + 1].setVisible(false);
                        }
                    }
                });
            });

        d3.select("#chart").on("mouseleave", function(){
            d3.select("body").on("mousemove", null);
        });


    }

    d3.select("body")
        .on("mouseup", function(){
        d3.select("body").on("mousemove", null);
    });



    function update(){

        //property/style changes
        yScale.domain([d3.min(allData, function(d){
            return d[1];
        }),d3.max(allData, function(d){
            return d[1];
        })]);
        //yAx.call(yAxis);


        nightLine = lineContent.append("path")
            .style({
                "stroke": "blue",
                "shape-rendering":"auto"
            })
            .datum(night)
            .attr("class", "line")
            .attr("d", line);

        dayLine = lineContent.append("path")
            .style("stroke", "orange")
            .datum(day)
            .attr("class", "line")
            .attr("d", line);
    }

    //function getCoordinateAlong(path) {
    //    var l = path.getTotalLength();
    //    return function(t) {
    //        var p =  path.getPointAtLength(t * l);
    //        return [p.x, p.y];
    //    };
    //}

    //initializeChart();
});
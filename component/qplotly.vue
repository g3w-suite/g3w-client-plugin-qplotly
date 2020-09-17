<template>
  <div id="3fe7c833-4546-438e-8cc6-5add20c7c960"></div>
</template>

<script>
  const GUI = g3wsdk.gui.GUI;
  export default {
    name: "qplotly",
    async mounted(){
      await this.$nextTick();
      const data = [{"type": "pie",
          "labels":
            ["Albania", "Andorra", "Austria", "Belgio", "Bosnia-Erzegovina", "Croazia", "Repubblica Ceca", "Danimarca", "Estonia", "Finlandia", "Francia", "Germania", "Gibilterra", "Grecia", "Ungheria", "Irlanda", "Italia", "Lettonia", "Lichtenstein", "Lituania", "Lussemburgo", "Macedonia, Ex Repubblica Jugoslava", "Malta", "Monaco", "Montenegro", "Paesi Bassi", "Norvegia", "Polonia", "Portogallo", "San Marino", "Serbia", "Slovacchia (Repubblica Slovacca)", "Slovenia", "Spagna", "Svezia", "Svizzera", "Regno Unito", "Armenia", "Azerbaigian", "Bielorussia", "Bulgaria", "Faroe, isole", "Georgia", "Islanda", "Svalbard e Jan Mayen", "Moldavia", "Romania", "Svalbard e Jan Mayen", "Turchia", "Ucraina", "Russia"], "values": [28748, 468, 83858, 30510, 51129, 56542, 78866, 43094, 45226, 337030, 547030, 357021, 7, 131940, 93030, 70280, 301230, 64589, 160, 65200, 2586, 25333, 316, 2, 14026, 41526, 324220, 312685, 92391, 61, 88361, 48845, 20273, 504782, 449964, 41290, 244820, 29800, 86600, 207600, 110910, 1399, 69700, 103000, 62049, 33843, 237500, 62049, 780580, 603700, 17075200],
          "marker": {"colors": ["#8ebad9"]}, "name": "NAME_IT"}
      ];
      const layout = {
        "showlegend": true,
        "legend": {
          "orientation": "v"
        },
        "title": "",
        "xaxis":
          {
            "title": "",
            "autorange": null,
            "range": null,
            "showgrid": false,
            "zeroline": false,
            "showline": false,
            "showticklabels": false
          },
        "yaxis": {
          "title": "",
          "autorange": null,
          "range": null,
          "type": "linear",
          "showgrid": false,
          "zeroline": false,
          "showline": false,
          "showticklabels": false
        },
        "paper_bgcolor": "rgb(255,255,255)", "plot_bgcolor": "rgb(255,255,255)"
      };
      const config = {
        "editable": true,
        "scrollZoom": true,
        "showLink": false,
        "linkText": "Export to plot.ly",
        "modeBarButtonsToRemove": ["toImage", "sendDataToCloud", "editInChartStudio"]
      };
      const plotly_div = document.getElementById('3fe7c833-4546-438e-8cc6-5add20c7c960');
      Plotly.newPlot(plotly_div, data, layout,config);
        // selecting function
      plotly_div.on('plotly_selected', function(data){
        var dds = {};
        dds["mode"] = 'selection';
        dds["type"] = data.points[0].data.type;
        featureIds = [];
        featureIdsTernary = [];
        data.points.forEach(function(pt){
          featureIds.push(parseInt(pt.id));
          featureIdsTernary.push(parseInt(pt.pointNumber));
          dds["id"] = featureIds
          dds["tid"] = featureIdsTernary
        });
        window.status = JSON.stringify(dds)
      });
      plotly_div.on('plotly_click', function(data){
        var featureIds = [];
        var dd = {};
        dd["fidd"] = data.points[0].id
        dd["mode"] = 'clicking'
          // loop and create dctionary depending on plot type
        for(var i=0; i < data.points.length; i++){
          // scatter plot
          if(data.points[i].data.type == 'scatter'){
            dd["uid"] = data.points[i].data.uid
            dd["type"] = data.points[i].data.type
            data.points.forEach(function(pt){
              dd["fid"] = pt.id
            })
          }

          // pie
          else if(data.points[i].data.type == 'pie'){
            dd["type"] = data.points[i].data.type
            dd["label"] = data.points[i].label
            dd["field"] = data.points[i].data.name
          }

          // histogram
          else if(data.points[i].data.type == 'histogram'){
            dd["type"] = data.points[i].data.type
            dd["uid"] = data.points[i].data.uid
            dd["field"] = data.points[i].data.name
              // correct axis orientation
            if(data.points[i].data.orientation == 'v'){
              dd["id"] = data.points[i].x
              dd["bin_step"] = data.points[i].fullData.xbins.size
            } else {
              dd["id"] = data.points[i].y
              dd["bin_step"] = data.points[i].fullData.ybins.size
            }
          } else if(data.points[i].data.type == 'box'){
            dd["uid"] = data.points[i].data.uid
            dd["type"] = data.points[i].data.type
            dd["field"] = data.points[i].data.customdata[0]
            // correct axis orientation
            if(data.points[i].data.orientation == 'v'){
              dd["id"] = data.points[i].x
            } else {
              dd["id"] = data.points[i].y
            }
          } else if(data.points[i].data.type == 'violin'){
            dd["uid"] = data.points[i].data.uid
            dd["type"] = data.points[i].data.type
            dd["field"] = data.points[i].data.customdata[0]
            // correct axis orientation (for violin is viceversa)
            if(data.points[i].data.orientation == 'v'){
              dd["id"] = data.points[i].x
            } else {
              dd["id"] = data.points[i].y
            }
          } else if(data.points[i].data.type == 'bar'){
            dd["uid"] = data.points[i].data.uid
            dd["type"] = data.points[i].data.type
            dd["field"] = data.points[i].data.customdata[0]
            // correct axis orientation
            if(data.points[i].data.orientation == 'v'){
              dd["id"] = data.points[i].x
            } else {
              dd["id"] = data.points[i].y
            }
          }
          // ternary
          else if(data.points[i].data.type == 'scatterternary'){
            dd["uid"] = data.points[i].data.uid
            dd["type"] = data.points[i].data.type
            dd["field"] = data.points[i].data.customdata
            dd["fid"] = data.points[i].pointNumber
          }
        }
        window.status = JSON.stringify(dd)
      });
    }
  }
</script>

<style scoped>
</style>
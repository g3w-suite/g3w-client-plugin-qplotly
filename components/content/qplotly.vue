<template>
  <div :id="id" style="height: 90% !important"></div>
</template>

<script>
  const GUI = g3wsdk.gui.GUI;
  const {resizeMixin} = g3wsdk.gui.vue.Mixins;
  const {getUniqueDomId} = g3wsdk.core.utils;
  let resizeTimeout;
  export default {
    name: "qplotly",
    mixins: [resizeMixin],
    methods: {
      resize(){
        resizeTimeout && clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(()=> this.plotly_div && Plotly.Plots.resize(this.plotly_div), 300);
      }
    },
    beforeCreated(){
      this.delayType = 'debounce';
    },
    created() {
      this.id = getUniqueDomId();
    },
    async mounted(){
      await this.$nextTick();
      GUI.setLoadingContent(true);
      const charts = await this.$options.service.getCharts();
      //data[0]["xaxis"] =  "x2";
      //data[0]["yaxis"] = "y2";
      //data.unshift({"type": "scatter", "x": [], "y": [], "mode": "markers", "textposition": "top center", "name": "nome", "ids": [4, 6, 8, 10, 3, 9, 1, 5], "customdata": ["nome"], "text": [], "hoverinfo": "all", "marker": {"color": "#8ebad9", "colorscale": "Greys", "showscale": false, "reversescale": false, "colorbar": {"len": 0.8}, "size": 10.0, "symbol": 0, "line": {"color": "#1f77b4", "width": 1.0}}, "line": {"width": 1.0, "dash": "solid"}, "opacity": 1.0, "xaxis": "x1", "yaxis": "y1"})
      //const layout = this.$options.service.getChartLayout();
      //const layout = {"xaxis1": {"domain": [0.0, 1.0], "anchor": "y1"}, "yaxis1": {"domain": [0.575, 1.0], "anchor": "x1"}, "xaxis2": {"domain": [0.0, 1.0], "anchor": "y2"}, "yaxis2": {"domain": [0.0, 0.425], "anchor": "x2"}};
      const config = this.$options.service.getChartConfig();
      //config.responsive = true;
      this.plotly_div = document.getElementById(this.id);
      GUI.setLoadingContent(false);
      Plotly.newPlot(this.plotly_div, charts.data, charts.layout, config);
        // selecting function
      this.plotly_div.on('plotly_selected', function(data){
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
      this.plotly_div.on('plotly_click', function(data){
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
        this.$options.service.on('change-charts', (charts)=>{
          Plotly.plot(this.plotly_div, charts.data, charts.layout);
        })
      });
    },
    beforeDestroy() {
      resizeTimeout && clearTimeout(resizeTimeout);
      this.id = null;
    }
  }
</script>

<style scoped>
</style>
<template>
  <div id="wrap-charts" style="height: 100%; position:relative;">
    <div :id="id" v-show="show" style="height: 100%; width: 100%;"></div>
    <div id="no_plots" v-if="!show" style="height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; background-color: white" class="skin-color">
      <h4 style="font-weight: bold;" v-t-plugin="'qplotly.no_plots'"></h4>
    </div>
  </div>
</template>

<script>
  const GUI = g3wsdk.gui.GUI;
  const {resizeMixin} = g3wsdk.gui.vue.Mixins;
  const {getUniqueDomId} = g3wsdk.core.utils;
  export default {
    name: "qplotly",
    mixins: [resizeMixin],
    data(){
      return {
        show: true
      }
    },
    methods: {
      resize(){
        this.plotly_div && Plotly.Plots.resize(this.plotly_div)
      },
      async handleDataLayout({start=false, charts={}}={}){
        const config = this.$options.service.getChartConfig();
        let temp_layout;
        const dataLength = charts.data.length;
        this.show = dataLength > 0;
        await this.$nextTick();
        if (dataLength > 0) {
          if (dataLength > 1) {
            charts.data[1]["xaxis"] = "x2";
            charts.data[1]["yaxis"] = "y2";
            charts.data[1].marker.color="#00FF00";
            temp_layout = {
              grid: {
                rows: dataLength,
                columns: 1,
                pattern: 'independent',
                roworder: 'bottom to top'}
            };
          } else temp_layout = charts.layout[0];
          this.plotly_div = document.getElementById(this.id);
          console.log(this.plotly_div)
          Plotly[start ? 'newPlot' : 'react'](this.plotly_div, charts.data, temp_layout , config);
        }
      }
    },
    beforeCreate(){
      this.delayType = 'debounce';
    },
    created(){
      this.id = getUniqueDomId();
    },
    async mounted(){
      await this.$nextTick();
      this.getCharts = async charts =>{
        this.handleDataLayout({
          charts
        })
      };
      this.$options.service.on('change-charts', this.getCharts);
      GUI.setLoadingContent(true);
      const charts = await this.$options.service.getCharts();
      this.show = charts.data.length > 0;
      await this.$nextTick();
      GUI.setLoadingContent(false);
      if (this.show) {
        await this.handleDataLayout({
          start: true,
          charts
        });
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
        });
      }
    },
    beforeDestroy() {
      this.$options.service.off('change-charts', this.getCharts);
      Plotly.purge(this.plotly_div);
      this.plotly_div = null;
    }
  }
</script>

<style scoped>
</style>
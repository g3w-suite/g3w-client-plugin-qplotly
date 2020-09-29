<template>
  <div id="wrap-charts" style="height: 100%; position:relative;" :style="{overflowY: overflowY}">
    <div id="qplotly_div" v-if="show" style="width: 100%;" :style="{height: `${height}%`}"></div>
    <div id="no_plots" v-else style="height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; background-color: white" class="skin-color">
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
        show: true,
        overflowY: 'none',
        height: 100
      }
    },
    methods: {
      resize(){
        this.plotly_div && Plotly.Plots.resize(this.plotly_div)
      },
      async handleDataLayout({charts={}}={}){
        const config = this.$options.service.getChartConfig();
        let temp_layout;
        const dataLength = charts.data.length;
        this.height = 100 + (dataLength > 2 ? dataLength - 2 : 0) * 50;
        this.overflowY = dataLength > 2 ? 'auto' : 'none';
        this.show = dataLength > 0;
        !this.show && this.plotly_div && Plotly.purge(this.plotly_div);
        await this.$nextTick();
        if (dataLength > 0) {
          const first_chart = charts.data[0];
          delete first_chart["xaxis"];
          delete first_chart["yaxis"];
          if (dataLength > 1) {
            for (let i = 1; i < dataLength; i++) {
              charts.data[i]["xaxis"] = `x${i+1}`;
              charts.data[i]["yaxis"] = `y${i+1}`;
            }
            temp_layout = {
              grid: {
                rows: dataLength,
                columns: 1,
                pattern: 'independent',
                roworder: 'top to bottom'}
            };
          } else temp_layout = charts.layout[0];
          this.plotly_div = document.getElementById('qplotly_div');
          Plotly.newPlot(this.plotly_div, charts.data, temp_layout , config);
        }
      }
    },
    beforeCreate(){
      this.delayType = 'debounce';
    },
    async mounted(){
      await this.$nextTick();
      this.getCharts = async charts =>{
        this.handleDataLayout({
          charts
        })
      };
      this.$options.service.on('change-charts', this.getCharts);
      const charts = await this.$options.service.getCharts();
      this.show = charts.data.length > 0;
      if (this.show) {
        await this.handleDataLayout({
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
      this.$options.service.clearLoadedPlots();
      Plotly.purge(this.plotly_div);
      this.plotly_div = null;
    }
  }
</script>

<style scoped>
</style>
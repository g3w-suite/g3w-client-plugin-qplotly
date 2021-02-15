<template>
  <div :id="id" class="skin-color" :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">
    <div v-if="showtools" class="qplotly-tools" style="border-radius: 3px; background-color: #FFFFFF; display: flex; padding: 3px; position: absolute; top: 3px; font-size:1.4em; right: 15px;">
      <span class="skin-color action-button skin-tooltip-bottom" data-placement="bottom" data-toggle="tooltip" style="font-weight: bold; margin-left: 2px"
        :class="[g3wtemplate.getFontClass('map'), state.tools.map.toggled ? 'toggled' : '']"
        @click="showMapFeaturesCharts" v-t-tooltip.create="'layer_selection_filter.tools.show_features_on_map'" ></span>
    </div>
    <bar-loader :loading="state.loading" v-if="wrapped"></bar-loader>
    <div v-if="show" class="plot_divs_content" style="width: 100%; background-color: #FFFFFF;" :style="{height: `${height}%`}">
      <div v-for="(plotly_div, index) in plotly_divs" style="position:relative; display: flex; justify-content: center; flex-direction: column; align-items: center" :style="{height: `${100/plotly_divs.length}%`}">
        <plotheader @toggle-bbox-tool="handleBBoxTools"  @toggle-filter-tool="handleToggleFilter"
          :index="index" :layerId="layersId[index]" :tools="tools[index]" :title="titles[index]" :filters="filters[index]">
        </plotheader>
        <div class="plot_div_content" :ref="plotly_div" style="position:relative; width:100%; height: 100%;"></div>
      </div>
    </div>
    <div id="no_plots" v-else style="height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; background-color: white" class="skin-color">
      <h4 style="font-weight: bold;" v-t-plugin="'qplotly.no_plots'"></h4>
    </div>
  </div>
</template>

<script>
  import PlotHeader from './plotheader.vue';
  const NoDataComponent = require('./nodata');
  const { tPlugin } = g3wsdk.core.i18n;
  const GUI = g3wsdk.gui.GUI;
  const {getUniqueDomId} = g3wsdk.core.utils;
  const {resizeMixin} = g3wsdk.gui.vue.Mixins;
  export default {
    name: "qplotly",
    mixins: [resizeMixin],
    components: {
      plotheader: PlotHeader
    },
    data(){
      this.id = getUniqueDomId();
      this.wrapped = !!this.$options.ids;
      this.relationData = this.$options.relationData;
      this.draw = true;
      return {
        state: this.$options.service.state,
        show: true,
        overflowY: 'none',
        height: 100,
        plotly_divs: [],
        filters:[],
        tools: [],
        titles:[],
        layersId: [],
        plotIds: []
      }
    },
    computed:{
      showtools(){
        return this.state.geolayer && !this.relationData;
      }
    },
    methods: {
      handleToggleFilter({layerId}={}){
        this.$options.service.toggleLayerFilter(layerId);
      },
      async handleBBoxTools({index, active}={}){
        const plotIds = [];
        if (!active) plotIds.push({
          id:this.plotIds[index],
          active
        });
        this.state.tools.map.toggled = this.tools.reduce((accumulator, current, index) => {
          const active = current.geolayer.show && current.geolayer.active;
          active && plotIds.push({
            id: this.plotIds[index],
            active
          });
          return accumulator && (current.geolayer.show ? active : true)
        },true);
        if (!this.state.tools.map.toggled && plotIds.length > 0) {
          const charts = await this.$options.service.showMapFeaturesSubPlotsCharts(plotIds);
          this.replaceExistingCharts(charts);
        } else this.showMapFeaturesCharts(false)
      },
      replaceExistingCharts(charts){
        charts.plotIds.forEach((plotId, index) =>{
          this.charts.plotIds.find((loadedPlotId, loadedIndex) => {
            if (loadedPlotId === plotId) {
              this.charts.data[loadedIndex] = charts.data[index];
              this.charts.filters[loadedIndex].splice(0);
              this.$nextTick(()=>{
                charts.filters[index].forEach(filter =>{
                  this.charts.filters[loadedIndex].push(filter)
                });
                this.drawPlotlyChart(loadedIndex, true);
              });
              return true
            }
          })
        });
        this.$options.service.chartsReady();
      },
      resize(){
        try {
          this.plotly_divs.forEach(plot_div =>{
            const content_div = this.$refs[plot_div][0];
            Plotly.Plots.resize(content_div);
          });
          Plotly.Plots.react();
        } catch (e) {}
      },
      async clearPlotlyData(){
        this.plotly_divs.forEach(plot_div =>{
          const content_div = this.$refs[plot_div][0];
          Plotly.purge(content_div)
        });
        this.plotly_divs.splice(0);
        this.filters.splice(0);
        this.titles.splice(0);
        this.tools.splice(0);
        this.layersId.splice(0);
        this.plotIds.splice(0);
        await this.$nextTick();
      },
      drawPlotlyChart(index, replace=false){
        if (this.draw) {
          const config = this.$options.service.getChartConfig();
          const content_div = this.$refs[this.plotly_divs[index]][0];
          if (this.charts.data[index] && Array.isArray(this.charts.data[index].x) && this.charts.data[index].x.length) {
            const data = [this.charts.data[index]];
            const layout = this.charts.layout[index];
            if (replace) content_div.innerHTML = '';
            setTimeout(()=>{
              Plotly.newPlot(content_div, data , layout, config);
            })
          } else {
            let component = Vue.extend(NoDataComponent);
            component = new component({
              propsData: {
                title: `Plot [${this.charts.plotIds[index]}] ${this.charts.layout[index] && this.charts.layout[index].title ? ' - ' + this.charts.layout[index].title: ''} `
              }
            });
            replace && content_div.firstChild.remove();
            setTimeout(()=> content_div.appendChild(component.$mount().$el));
          }
        }
      },
      async handleDataLayout({charts={}}={}){
        this.show = false;
        await this.clearPlotlyData();
        const dataLength = charts.data.length;
        const addedHeight = (this.relationData && this.relationData.height ? (dataLength > 1 ? dataLength * 50: 0) : (dataLength > 2 ? dataLength - 2 : 0) * 50 );
        this.height = 100 + addedHeight;
        this.overflowY = addedHeight > 0 ? 'auto' : 'none';
        this.show = dataLength > 0;
        if (this.draw && dataLength > 0) {
          for (let i=0; i < dataLength; i++){
            this.plotly_divs.push(`plot_div_${i}`);
            this.titles.push(charts.layout[i].title.toUpperCase());
            this.filters.push((charts.filters[i]));
            this.tools.push(charts.tools[i]);
            this.layersId.push(charts.layersId[i]);
            this.plotIds.push(charts.plotIds[i]);
          }
          await this.$nextTick();
          for (let i = 0; i < dataLength; i++) {
           this.drawPlotlyChart(i);
          }
        }
        await this.$nextTick();
        // call ready
        this.$options.service.chartsReady();
      },
      showMapFeaturesCharts(change=true){
        this.$options.service.showMapFeaturesAllCharts(change);
      }
    },
    beforeCreate(){
      this.delayType = 'debounce';
    },
    async mounted(){
      await this.$nextTick();
      this.getCharts = ({charts, subplots}) =>{
        // in case of subplots replace
        if (subplots )this.replaceExistingCharts(charts);
        else {
          this.charts = charts;
          this.handleDataLayout({
            charts
          })
        }

      };
      this.$options.service.on('change-charts', this.getCharts);

      const charts = await this.$options.service.getCharts({
        layerIds: this.$options.ids,
        relationData: this.relationData
      });
      this.show = charts.data.length > 0;
      if (this.show) {
        this.charts = charts;
        await this.handleDataLayout({
          charts
        });
        this.relationData && GUI.on('pop-content', this.resize);
      } else this.$options.service.chartsReady();
    },
    beforeDestroy() {
      this.draw = false;
      this.$options.service.off('change-charts', this.getCharts);
      this.relationData && GUI.off('pop-content', this.resize);
      this.$options.service.clearLoadedPlots();
      this.clearPlotlyData();
      this.charts = null;
      this.draw = null;
    }
  }
</script>

<style scoped>
</style>
<template>
  <div :id="id" style="" :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">
    <div v-if="showtools" class="qplotly-tools" style="display: flex; padding: 3px; position: absolute; top: 5px; right: 5px;">
      <div class="skin-color action-button skin-tooltip-bottom" data-placement="bottom" data-toggle="tooltip" :class="[g3wtemplate.getFontClass('map'), state.tools.map.toggled ? 'toggled-white' : '']" @click="showMapFeaturesCharts" v-t-tooltip.create="'layer_selection_filter.tools.show_features_on_map'" ></div>
    </div>
    <bar-loader :loading="state.loading" v-if="wrapped"></bar-loader>
    <div v-if="show" class="plot_divs_content" style="width: 100%; background-color: #FFFFFF;" :style="{height: `${height}%`}">
      <div v-for="(plotly_div, index) in plotly_divs" style="border-bottom: 2px solid #eeee; position:relative; display: flex; justify-content: center; flex-direction: column; align-items: center" :style="{height: `${100/plotly_divs.length}%`}">
        <div v-if="filters[index].length" class="skin-background-color" style="width:100%;color: #FFFFFF; font-weight: bold;">
          <filtersinfo :filters="filters[index]"></filtersinfo>
        </div>
        <div class="plot_div_content" :ref="plotly_div" style="position:relative; width:100%; height: 100%;"></div>
      </div>
    </div>
    <div id="no_plots" v-else style="height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; background-color: white" class="skin-color">
      <h4 style="font-weight: bold;" v-t-plugin="'qplotly.no_plots'"></h4>
    </div>
  </div>
</template>

<script>
  const NoDataComponent = require('./nodata');
  const FiltersInfo = require('./filtersinfo');
  const { tPlugin } = g3wsdk.core.i18n;
  const GUI = g3wsdk.gui.GUI;
  const {getUniqueDomId} = g3wsdk.core.utils;
  const {resizeMixin} = g3wsdk.gui.vue.Mixins;
  export default {
    name: "qplotly",
    mixins: [resizeMixin],
    components: {
      filtersinfo: FiltersInfo
    },
    data(){
      this.id = getUniqueDomId();
      this.wrapped = !!this.$options.ids;
      this.relationData = this.$options.relationData;
      return {
        state: this.$options.service.state,
        show: true,
        overflowY: 'none',
        height: 100,
        plotly_divs: [],
        filters:[]
      }
    },
    computed:{
      showtools(){
        return this.state.geolayer && !this.relationData;
      }
    },
    methods: {
      resize(){
        try {
          this.plotly_divs.forEach(plot_div =>{
            const content_div = this.$refs[plot_div][0];
            Plotly.Plots.resize(content_div);
          });
          Plotly.Plots.react();
        } catch (e) {}
      },
      async clearPlotlyDivs(){
        this.plotly_divs.forEach(plot_div =>{
          const content_div = this.$refs[plot_div][0];
          Plotly.purge(content_div)
        });
        this.plotly_divs.splice(0);
        this.filters.splice(0);
        await this.$nextTick();

      },
      async handleDataLayout({charts={}}={}){
        this.show = false;
        await this.clearPlotlyDivs();
        const config = this.$options.service.getChartConfig();
        const dataLength = charts.data.length;
        const addedHeight = (this.relationData && this.relationData.height ? dataLength * 50 : (dataLength > 2 ? dataLength - 2 : 0) * 50 );
        this.height = 100 + addedHeight;
        this.overflowY = addedHeight > 0 ? 'auto' : 'none';
        this.show = dataLength > 0;
        if (dataLength > 0) {
          for (let i=0; i < dataLength; i++){
            this.plotly_divs.push(`plot_div_${i}`);
            const filters = charts.filters[i];
            this.filters.push(Object.keys(filters).filter(filter => filters[filter]));
          }
          await this.$nextTick();
          for (let i = 0; i < dataLength; i++) {
            const content_div = this.$refs[this.plotly_divs[i]][0];
            if (charts.data[i] && Array.isArray(charts.data[i].x) && charts.data[i].x.length) {
              const data = [charts.data[i]];
              const layout = charts.layout[i];
              Plotly.newPlot(content_div, data , layout, config);
            } else {
              let component = Vue.extend(NoDataComponent);
              component = new component({
                propsData: {
                  title: `Plot [${charts.plotIds[i]}] ${charts.layout[i] && charts.layout[i].title ? ' - ' + charts.layout[i].title: ''} `
                }
              });
              content_div.appendChild(component.$mount().$el)
            }
          }
        }

      },
      showMapFeaturesCharts(){
        this.$options.service.showMapFeaturesCharts();
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
      const charts = await this.$options.service.getCharts(this.$options.ids, this.relationData);
      this.show = charts.data.length > 0;
      if (this.show) {
        await this.handleDataLayout({
          charts
        });
        this.relationData && GUI.on('pop-content', this.resize)
      }
    },
    beforeDestroy() {
      this.$options.service.off('change-charts', this.getCharts);
      this.relationData && GUI.off('pop-content', this.resize);
      this.$options.service.clearLoadedPlots();
      this.clearPlotlyDivs();
    }
  }
</script>

<style scoped>
</style>
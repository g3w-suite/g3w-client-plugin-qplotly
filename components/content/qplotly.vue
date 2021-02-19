<template>
  <div :id="id" class="skin-color" :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">
    <div v-if="showtools" class="qplotly-tools" style="border-radius: 3px; background-color: #FFFFFF; display: flex; padding: 3px; position: absolute; top: 3px; font-size:1.4em; right: 15px;">
      <span class="skin-color action-button skin-tooltip-bottom" data-placement="bottom" data-toggle="tooltip" style="font-weight: bold; margin-left: 2px"
        :class="[g3wtemplate.getFontClass('map'), state.tools.map.toggled ? 'toggled' : '']"
        @click="showMapFeaturesCharts" v-t-tooltip.create="'layer_selection_filter.tools.show_features_on_map'" ></span>
    </div>
    <bar-loader :loading="state.loading" v-if="wrapped"></bar-loader>
    <div v-if="show" class="plot_divs_content" style="width: 100%; background-color: #FFFFFF; position: relative" :style="{height: `${height}%`}">
      <div v-for="(plotId, index) in order" :key="plotId" style="position:relative;"  :style="{height: `${100/order.length}%`}">
        <plotheader @toggle-bbox-tool="handleBBoxTools"  @toggle-filter-tool="handleToggleFilter"
          :index="index" :layerId="charts[plotId].layerId" :tools="!relationData ? charts[plotId].tools : undefined"
          :title="charts[plotId].titles" :filters="charts[plotId].filters">
        </plotheader>
        <div class="plot_div_content" :ref="plotId" style="width:95%; margin: auto"></div>
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
      return {
        state: this.$options.service.state,
        show: true,
        overflowY: 'none',
        height: 100,
        order: []
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
          id:this.order[index],
          active
        });
        this.state.tools.map.toggled = Object.values(this.order).reduce((accumulator, plotId, index) => {
          const tools = this.charts[plotId].tools;
          const active = tools.geolayer.show && tools.geolayer.active;
          active && plotIds.push({
            id: plotId,
            active
          });
          return accumulator && (tools.geolayer.show ? active : true)
        },true);
        const {charts, order} = await this.$options.service.showMapFeaturesSubPlotsCharts(plotIds);
        this.setCharts({
          charts,
          order
        });
      },

      /*
      action: 'show', 'hide'
      * */
      async showHideChart({plotId, charts={}, order=[], action, filter}={}){
        this.order = order;
        this.$nextTick();
        const visibleCharts = this.order.length;
        this.show = visibleCharts > 0;
        switch(action){
          case 'hide':
            this.charts[plotId].filters = filter;
            if (Object.keys(charts).length)
              await this.setCharts({
                charts,
                order
              });
            else {
              await this.calculateHeigths(visibleCharts);
              this.order.forEach(plotId =>{
                const domElement = this.$refs[plotId][0];
                this.setChartPlotHeigth(domElement);
              });
            }
            break;
          case 'show':
            this.show = true;
            await this.$nextTick();
            this.calculateHeigths(visibleCharts);
            this.order.forEach(plotId =>{
              this.drawPlotlyChart({
                plotId
              })
            });
            break;
        }
        this.show && this.resize();
      },
      async setCharts({charts={}, order=[]}={}){
        Object.keys(charts).forEach(plotId =>{
          this.charts[plotId] = charts[plotId];
        });
        const visibleCharts = order.length;
        this.show = visibleCharts > 0;
        this.order = order;
        this.$nextTick();
        if (this.show) {
          await this.calculateHeigths(visibleCharts);
          this.order.forEach(plotId =>{
            this.drawPlotlyChart({
              plotId
            });
          });
        }
        // call ready
        this.$options.service.chartsReady();
        this.loadindcharts = false;
      },
      resize(){
        try {
          this.order.forEach(plotId =>{
            const domElement = this.$refs[plotId][0];
            this.setChartPlotHeigth(domElement);
            Plotly.Plots.resize(domElement);
          });
          //Plotly.Plots.react();
        } catch (e) {}
      },
      setChartPlotHeigth(domElement){
        setTimeout(()=>{
          const jqueryContent = $(domElement);
          domElement.style.height = `${jqueryContent.parent().outerHeight() - jqueryContent.siblings().outerHeight()}px`;
        })
      },
      drawPlotlyChart({plotId, replace=false}={}){
        const config = this.$options.service.getChartConfig();
        const domElement = this.$refs[plotId][0];
        this.setChartPlotHeigth(domElement);
        const data = this.charts[plotId].data;
        const layout = this.charts[plotId].layout;
        if (data && Array.isArray(data.x) && data.x.length) {
          if (replace) content_div.innerHTML = '';
          setTimeout(()=>{
            Plotly.newPlot(domElement, [data] , layout, config);
          })
        } else {
          let component = Vue.extend(NoDataComponent);
          component = new component({
            propsData: {
              title: `Plot [${plotId}] ${layout && layout.title ? ' - ' + layout.title: ''} `
            }
          });
          replace && domElement.firstChild.remove();
          setTimeout(()=> domElement.appendChild(component.$mount().$el));
        }
      },
      async calculateHeigths(visibleCharts=0){
        return new Promise(async (resolve) =>{
          const addedHeight = (this.relationData && this.relationData.height ? (visibleCharts > 1 ? visibleCharts * 50: 0) : (visibleCharts > 2 ? visibleCharts - 2 : 0) * 50 );
          this.height = 100 + addedHeight;
          await this.$nextTick();
          this.overflowY = addedHeight > 0 ? 'auto' : 'none';
          resolve();
        })
      },

      async showMapFeaturesCharts(){
        const {charts, order } = await this.$options.service.showMapFeaturesAllCharts(true);
        this.setCharts({
          charts,
          order
        });
      }
    },
    beforeCreate(){
      this.delayType = 'debounce';
    },
    created(){
      this.charts = {}
    },
    async mounted(){
      await this.$nextTick();
      this.$options.service.on('change-charts', this.setCharts);
      this.$options.service.on('show-hide-chart', this.showHideChart);
      const {charts, order} = await this.$options.service.getCharts({
        layerIds: this.$options.ids,
        relationData: this.relationData
      });
      await this.setCharts({
        charts,
        order
      });
      this.relationData && GUI.on('pop-content', this.resize);
    },
    beforeDestroy() {
      this.$options.service.off('change-charts', this.getCharts);
      this.$options.service.off('show-hide-chart', this.showHideChart);
      this.relationData && GUI.off('pop-content', this.resize);
      this.$options.service.clearLoadedPlots();
      this.charts = null;
    }
  }
</script>

<style scoped>
</style>
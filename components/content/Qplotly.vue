<template>
  <div
    :id="id"
    class="skin-color"
    :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">

      <bar-loader :loading="state.loading" v-if="wrapped"/>

      <div
        v-if="show"
        class="plot_divs_content"
        style="width: 100%; background-color: #FFFFFF; position: relative"
        :style="{height: `${height}%`}">

        <div
          v-for="(plotId, index) in order"
          :key="plotId"
          style="position:relative;"
          v-disabled="state.loading"
          :style="{height: relationData && relationData.height ? `${relationData.height}px` : `${100/nCharts}%`}">

          <template
            v-for="({chart, state}, index) in charts[plotId]">
            <plotheader
              @toggle-bbox-tool="handleBBoxTools"  @toggle-filter-tool="handleToggleFilter"
              :index="index" :layerId="chart.layerId" :tools="!relationData ? chart.tools : undefined"
              :title="chart.title" :filters="chart.filters"/>

            <div
              class="plot_div_content"
              :ref="`${plotId}_${index}`"
              style="width:95%; margin: auto; position:relative">
            </div>

          </template>

      </div>

    </div>

    <div
      v-else
      id="no_plots"
      style="height: 100%; width: 100%; display: flex; justify-content: center; align-items: center; background-color: white"
      class="skin-color">

        <h4
          style="text-align: center; font-weight: bold;"
          v-t-plugin="'qplotly.no_plots'">
        </h4>

    </div>

  </div>

</template>

<script>
  import PlotHeader from './Plotheader.vue';

  const {GUI} = g3wsdk.gui;
  const {getUniqueDomId} = g3wsdk.core.utils;
  const {resizeMixin} = g3wsdk.gui.vue.Mixins;

  const NoDataComponent = require('./nodata');

  const TYPE_VALUES = {
    'pie': 'values',
    'scatterternary': 'a',
    'scatterpolar': 'r'
  };

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
      const state = this.$options.service.state;
      return {
        state,
        show: true,
        overflowY: 'none',
        height: 100,
        order: [],
        nCharts: 0
      }
    },

    methods: {
      /**
       *
       * @param layerId
       */
      handleToggleFilter({layerId}={}){
        this.$options.service.toggleLayerFilter(layerId);
      },
      /**
       *
       * @param index
       * @param active
       * @returns {Promise<void>}
       */
      async handleBBoxTools({index, active}={}){
        const plotIds = [];
        if (!active) plotIds.push({
          id:this.order[index],
          active
        });
        this.state.tools.map.toggled = Object.values(this.order).reduce((accumulator, plotId) => {
          return accumulator && this.charts[plotId].reduce((accumulator, {chart}) => {
            const tools = chart.tools;
            const active = tools.geolayer.show && tools.geolayer.active;
            active && plotIds.push({
              id: plotId,
              active
            });
            return accumulator && (tools.geolayer.show ? active : true)
          }, true);
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
        this.nCharts = this.$options.service.getNumberOfShowPlots();
        const visibleCharts = this.nCharts;
        await this.$nextTick();
        this.show = visibleCharts > 0;
        switch(action){
          case 'hide':
            this.charts[plotId].forEach(({chart}) => chart.filters = filter);
            if (Object.keys(charts).length)
              await this.setCharts({
                charts,
                order
              });
            else {
              await this.calculateHeigths(visibleCharts);
              await this.resizePlots();
            }
            break;
          case 'show':
            this.show = true;
            await this.calculateHeigths(visibleCharts);
            await this.drawAllCharts();
            this.$options.service.chartsReady();
            break;
        }
        // if show true need to call resize to update charts already show
        if (this.show)  {
          this.resize();
        }
      },

      /**
       *
       * @returns {Promise<void>}
       */
      async resizePlots(){
        !this.wrapped && await this.$options.service.updateCharts();
        const promises = [];
        this.order.forEach(plotId =>{
          this.charts[plotId].forEach((chart, index) =>{
            const domElement = this.$refs[`${plotId}_${index}`][0];
            this.setChartPlotHeigth(domElement);
            promises.push(new Promise(resolve =>{
              Plotly.Plots.resize(domElement).then(()=>{
                resolve(plotId);
              })
            }))
          })
        });
        const chartsPlotIds = await Promise.allSettled(promises);
        chartsPlotIds.forEach(({value}) => this.charts[value].forEach(({chart, state}) => state.loading = false));
        !this.wrapped && this.$options.service.chartsReady();
      },

      /**
       *
       * @returns {Promise<void>}
       */
      async drawAllCharts(){
        await this.$nextTick();
        const promises = [];
        // loop through loop plot ids order
        this.order.forEach(plotId => {
          const promise = this.drawPlotlyChart({
            plotId
          });
          promise && promises.push(promise)
        });
        if (promises.length > 0) {
          const chartPlotIds = await Promise.allSettled(promises);

          chartPlotIds.forEach(({value}) => {

            this.charts[value].forEach((chart) => {
              chart.state.loading = false;
            })

          });
        }
      },

      /**
       *
       * @param charts <Object>
       * @param order
       * @returns {Promise<void>}
       */
      async setCharts({charts={}, order=[]}={}){

        this.nCharts = this.$options.service.getNumberOfShowPlots();

        Object.keys(charts).forEach((plotId) => {
          this.charts[plotId] = [];
          charts[plotId].forEach((chart) => {

            this.charts[plotId].push({
              chart,
              state: Vue.observable({
                loading: false
              })
            });

          })
        });
        const visibleCharts = this.nCharts;

        this.show = visibleCharts > 0;

        this.order = order;

        this.$nextTick();

        if (this.show) {
          await this.calculateHeigths(visibleCharts);
          await this.drawAllCharts();
        }
        setTimeout(()=> {
          this.$options.service.chartsReady();
        })
      },

      /**
       * Method call when resize window browser or chart content
       * @returns {Promise<void>}
       */
      async resize(){
        this.mounted && await this.resizePlots();
      },

      /**
       *
       * @param domElement
       */
      setChartPlotHeigth(domElement){
        setTimeout(()=>{
          const jqueryContent = $(domElement);
          domElement.style.height = `${jqueryContent.parent().outerHeight() - jqueryContent.siblings().outerHeight()}px`;
        })
      },

      /**
       *
       * @param plotId
       * @returns {*}
       */
      drawPlotlyChart({plotId}={}){
        let promise;
        this.charts[plotId].forEach(({chart, state}, index) =>{
          const config = this.$options.service.getChartConfig();
          const domElement = this.$refs[`${plotId}_${index}`][0];
          const {data, layout} = chart;
          this.setChartPlotHeigth(domElement);
          if (data && Array.isArray(data[TYPE_VALUES[data.type] || 'x']) && data[TYPE_VALUES[data.type] || 'x'].length) {
            state.loading = !this.relationData;
            promise = new Promise(resolve =>{
              setTimeout(()=>{
                Plotly.newPlot(domElement, [data] , layout, config).then(()=>{
                  resolve(plotId)
                });
              })
            })
          } else {
            domElement.innerHTML = '';
            let component = Vue.extend(NoDataComponent);
            component = new component({
              propsData: {
                title: `Plot [${plotId}] ${layout && layout.title ? ' - ' + layout.title: ''} `
              }
            });
            setTimeout(()=> domElement.appendChild(component.$mount().$el));
          }
        });
        return promise;
      },

      /**
       *
       * @param visibleCharts
       * @returns {Promise<unknown>}
       */
      async calculateHeigths(visibleCharts=0){
        return new Promise(async (resolve) =>{
          const addedHeight = (this.relationData && this.relationData.height ? (visibleCharts > 1 ? visibleCharts * 50: 0) : (visibleCharts > 2 ? visibleCharts - 2 : 0) * 50 );
          this.height = 100 + addedHeight;
          await this.$nextTick();
          this.overflowY = addedHeight > 0 ? 'auto' : 'none';
          resolve();
        })
      },

      /**
       *
       * @returns {Promise<void>}
       */
      async showMapFeaturesCharts(){
        const {charts, order} = await this.$options.service.showMapFeaturesAllCharts(true);
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
      this.nCharts = this.$options.service.getNumberOfShowPlots();
      this.charts = {};
    },
    async mounted(){

      this.mounted = false;

      await this.$nextTick();

      this.$options.service.on('change-charts', this.setCharts);

      this.$options.service.on('show-hide-chart', this.showHideChart);

      const {charts, order} = await this.$options.service.getCharts({
        layerIds: this.$options.ids,
        relationData: this.relationData
      });

      await this.setCharts({charts, order});

      this.relationData && GUI.on('pop-content', this.resize);

      this.mounted = true;
    },

    beforeDestroy() {
      this.$options.service.off('change-charts', this.setCharts);

      this.$options.service.off('show-hide-chart', this.showHideChart);

      this.relationData && GUI.off('pop-content', this.resize);

      this.$options.service.clearLoadedPlots();

      this.charts = null;

      this.nCharts = 0;
    }
  }
</script>

<style scoped>
</style>
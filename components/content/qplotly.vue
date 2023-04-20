<template>
  <div
    v-disabled="state.loading"
    :id="id"
    class="skin-color"
    :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">

      <bar-loader :loading="state.loading" v-if="insideCointainer"/>

      <div
        v-if="show"
        class="plot_divs_content"
        style="width: 100%; background-color: #FFFFFF; position: relative"
        :style="{height: `${height}%`}">

        <div
          v-for="(plotId, index) in order"
          :key="plotId"
          style="position:relative;"
          :style="{height: relationData && relationData.height ? `${relationData.height}px` : `${100/order.length}%`}">

            <template v-for="({chart, state}) in charts[plotId]">

              <plotheader
                @toggle-bbox-tool="handleBBoxTools"
                @toggle-filter-tool="handleToggleFilter"
                :index="index" :layerId="chart.layerId"
                :tools="!relationData ? chart.tools : undefined"
                :title="chart.title"
                :filters="chart.filters"/>

              <div
                class="plot_div_content"
                :ref="`${plotId}`"
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
  import PlotHeader from './plotheader.vue';

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
      this.insideCointainer = "undefined" !== typeof this.$options.ids;
      this.relationData = this.$options.relationData;
      return {
        state: this.$options.service.state,
        show: true,
        overflowY: 'none',
        height: 100,
        order: [], //array of ordered plot id
      }
    },

    methods: {
      /**
       *
       * @param layerId
       */
      async handleToggleFilter({layerId}={}){
        //add to start loading (disable)
        //TODO find better solution
        this.$options.service.setLoadingCharts(true);
        //call toggleLayer
        await this.$options.service.toggleLayerFilter(layerId);
      },
      /**
       * Handle click on map icon tool (show bbox data)
       * @param index
       * @param active
       * @returns {Promise<void>}
       */
      async handleBBoxTools({index, active}={}){
        //add to start loading (disable)
        //TODO find better solution
        this.$options.service.setLoadingCharts(true);
        //loop through order plotId
        const id = this.order[index]; //plot id
        //call plugin service updateMapBBOXData method
        const {charts, order} = await this.$options.service.updateMapBBOXData({id, active});
        // global map tool toggled status base on plot belong to geolayer show on charts
        this.state.tools.map.toggled = Object.values(this.order).reduce((accumulator, id) => {
          //return true or false based on map active geo tools
          return accumulator && this.charts[id].reduce((accumulator, {chart}) => {
              const active = chart.tools.geolayer.show && chart.tools.geolayer.active;
              return accumulator && (chart.tools.geolayer.show ? active : true)
            }, true);

          }, true);
        //call set Charts based on change map tool toggled
        this.setCharts({
          charts,
          order
        });
      },

        /**
         * Method called from showPlot or hidePlot plugin service (check/uncheck) chart checkbox
         * @param plotId
         * @param charts
         * @param order
         * @param action
         * @param filter
         * @returns {Promise<void>}
         */
      async showHideChart({plotId, charts={}, order=[], action, filter}={}){
        this.order = order;
        await this.$nextTick();
        this.show = this.order.length > 0;
        switch(action){
          case 'hide':
            //need to remove charts [plotId]
            delete this.charts[plotId];
            //this.charts[plotId].forEach(({chart}) => chart.filters = filter});
            if (this.show) {
              await this.setCharts({charts, order});
            } else {
              await this.calculateHeigths(this.order.length);
              await this.resizePlots();
            }
            break;
          case 'show':
            this.show = true;
            await this.calculateHeigths(this.order.length);
            await this.drawAllCharts();
            break;
        }
        // if show true need to call resize to update charts already show
        if (this.show) {
          this.resize();
        }
      },

      /**
       *
       * @returns {Promise<void>}
       */
      async resizePlots(){

        if (false === this.insideCointainer) {
          this.$options.service.setLoadingCharts(true);
        }

        const promises = [];
        this.order.forEach(plotId =>{
          this.charts[plotId].forEach((chart, index) =>{
            const domElement = this.$refs[`${plotId}`][0];
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

        if (false === this.insideCointainer) {
          this.$options.service.setLoadingCharts(false);
        }
      },

      /**
       *
       * @returns {Promise<void>}
       */
      async drawAllCharts(){
        this.$options.service.setLoadingCharts(true);
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

        this.$options.service.setLoadingCharts(false);

      },

      /**
       *
       * @param charts <Object>
       * @param order <Array> of plot id ordered
       * @returns {Promise<void>}
       */
      async setCharts({charts={}, order=[]}={}){
        //set loading
        this.$options.service.setLoadingCharts(true);
        //get new charts order
        this.order = order;
        //check if there are plot charts to show
        this.show = this.order.length > 0;
        //loop through charts
        //TODO check other way
        Object.keys(charts).forEach((plotId) => {
            // initialize chart with plotId
          this.charts[plotId] = [];
          //get chart
          charts[plotId].forEach((chart) => {
            this.charts[plotId].push({
              chart,
              // set reactive state by Vue.observable
              state: Vue.observable({
                loading: false
              })
            });

          })
        });

        this.$nextTick();

        if (this.show) {
          
          await this.calculateHeigths(this.order.length);
          
          await this.drawAllCharts();
        }
        setTimeout(() => {

          this.$options.service.setLoadingCharts(false);

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
        setTimeout(() => {
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
          const domElement = this.$refs[`${plotId}`][0];
          const {data, layout} = chart;
          this.setChartPlotHeigth(domElement);
          if (data && Array.isArray(data[TYPE_VALUES[data.type] || 'x']) && data[TYPE_VALUES[data.type] || 'x'].length) {
            state.loading = !this.relationData;
            promise = new Promise(resolve =>{
              setTimeout(()=>{
                Plotly.newPlot(domElement, [data] , layout, config).then(() => resolve(plotId));
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

        const addedHeight = (
          (this.relationData && this.relationData.height) ?
            (visibleCharts > 1 ? visibleCharts * 50: 0) :
            (visibleCharts > 2 ? visibleCharts - 2 : 0) * 50 );

        this.height = 100 + addedHeight;

        await this.$nextTick();

        this.overflowY = addedHeight > 0 ? 'auto' : 'none';
      },

    },

    beforeCreate() {
      this.delayType = 'debounce';
    },

    created() {
      this.charts = {};
    },

    async mounted() {
      //set mounted false
      this.mounted = false;

      await this.$nextTick();
      
      // listen event change-charts
      this.$options.service.on('change-charts', this.setCharts);
      
      //listen event show hide chart
      this.$options.service.on('show-hide-chart', this.showHideChart);

      // at mount time get Charts
      const {charts, order} = await this.$options.service.getCharts({
        layerIds: this.$options.ids, // provide by query result service otherwise is undefined
        relationData: this.relationData // provide by query result service otherwise is undefined
      });

      // set charts
      await this.setCharts({charts, order});
      //this.relationData is passed by query result service
      // when show feature charts or relation charts feature
      if ("undefined" !== typeof this.relationData) {
        GUI.on('pop-content', this.resize);
      }
      //set mounted true
      this.mounted = true;
    },

    beforeDestroy() {
      //un listen all events
      this.$options.service.off('change-charts', this.setCharts);

      this.$options.service.off('show-hide-chart', this.showHideChart);

      this.relationData && GUI.off('pop-content', this.resize);

      this.$options.service.clearLoadedPlots();

      this.charts = null;

      this.order = null ;
    }
  }
</script>

<style scoped>
</style>
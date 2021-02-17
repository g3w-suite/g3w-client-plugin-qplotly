<template>
  <div :id="id" class="skin-color" :style="{overflowY: overflowY, height: relationData && relationData.height ? `${relationData.height}px`: '100%'}">
    <div v-if="showtools" class="qplotly-tools" style="border-radius: 3px; background-color: #FFFFFF; display: flex; padding: 3px; position: absolute; top: 3px; font-size:1.4em; right: 15px;">
      <span class="skin-color action-button skin-tooltip-bottom" data-placement="bottom" data-toggle="tooltip" style="font-weight: bold; margin-left: 2px"
        :class="[g3wtemplate.getFontClass('map'), state.tools.map.toggled ? 'toggled' : '']"
        @click="showMapFeaturesCharts" v-t-tooltip.create="'layer_selection_filter.tools.show_features_on_map'" ></span>
    </div>
    <bar-loader :loading="state.loading" v-if="wrapped"></bar-loader>
    <div v-if="show" class="plot_divs_content" style="width: 100%; background-color: #FFFFFF; position: relative" :style="{height: `${height}%`}">
      <div v-for="(plotly_div, index) in plotly_divs" :key="plotly_div" style="position:relative;"  :style="{height: `${100/plotly_divs.length}%`}">
        <plotheader @toggle-bbox-tool="handleBBoxTools"  @toggle-filter-tool="handleToggleFilter"
          :index="index" :layerId="layersId[index]" :tools="!relationData ? tools[plotly_div] : undefined" :title="titles[plotly_div]" :filters="filters[plotly_div]">
        </plotheader>
        <div class="plot_div_content" :id="plotly_div" :ref="plotly_div" style="width:95%; margin: auto"></div>
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
        tools: {},
        titles:{},
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
        this.state.tools.map.toggled = Object.values(this.tools).reduce((accumulator, current, index) => {
          const active = current.geolayer.show && current.geolayer.active;
          active && plotIds.push({
            id: this.plotIds[index],
            active
          });
          return accumulator && (current.geolayer.show ? active : true)
        },true);
        const charts = await this.$options.service.showMapFeaturesSubPlotsCharts(plotIds);
        this.replaceAddExistingCharts(charts);
      },
      findChartIndex(plotId){
        let index;
        this.state.positions.find((id, idx) => {
          if (id === plotId){
            index = idx;
            return true
          }
        });
        return index;
      },

      /*
      action: 'show', 'hide'
      * */
      async showHideChart({plotId, action, filter}={}){
        const plot_div = this.findChartIndex(plotId);
        switch(action){
          case 'hide':
            this.plotly_divs = this.plotly_divs.filter(_plot_div => _plot_div !== plot_div);
            this.show = this.plotly_divs.length > 0;
            this.filters[plot_div] = filter;
            this.$nextTick();
            await this.calculateHeigths();
            this.show && this.plotly_divs.forEach(plot_div =>{
              const content_div = this.$refs[plot_div][0];
              this.setChartPlotHeigth(content_div);
            });
            break;
          case 'show':
            this.show = true;
            await this.$nextTick();
            this.plotly_divs.length && this.plotly_divs.find((position, idx) => {
              if (position > plot_div){
                this.plotly_divs.splice(idx, 0, plot_div);
                return true;
              }
            }) || this.plotly_divs.push(plot_div);
            await this.$nextTick();
            this.calculateHeigths();
            this.drawPlotlyChart({
              index: plot_div,
              plot_div
            });
            this.plotly_divs.forEach(plot_div =>{
              const content_div = this.$refs[plot_div][0];
              this.setChartPlotHeigth(content_div);
            });
            break;
        }
        this.show && this.resize();
      },
      async replaceAddExistingCharts(charts){
        charts.plotIds.forEach((plotId, index) =>{
          const replace = this.charts.plotIds.find((loadedPlotId, loadedIndex) => {
            if (loadedPlotId === plotId) {
              this.charts.data[loadedIndex] = charts.data[index];
              this.charts.filters[loadedIndex].splice(0);
              charts.filters[index].forEach(filter =>{
                this.charts.filters[loadedIndex].push(filter)
              });
              const plot_div = this.findChartIndex(plotId);
              this.drawPlotlyChart({
                index: loadedIndex,
                plot_div,
                replace: true
              });
              return true
            }
          });
          if (replace === undefined) {
            const plot_div_id = this.findChartIndex(plotId);
            this.charts.plotIds.splice(plot_div_id,0, plotId);
            this.charts.data.splice(plot_div_id, 0, charts.data[index]);
            this.charts.filters.splice(plot_div_id, 0,charts.filters[index]);
            this.charts.layout.splice(plot_div_id, 0,  charts.layout[index]);
            this.plotly_divs.splice(plot_div_id, 0, plot_div_id);
            Vue.set(this.titles, plot_div_id, charts.layout[index].title.toUpperCase());
            Vue.set(this.filters, plot_div_id, charts.filters[index]);
            Vue.set(this.tools, plot_div_id, charts.tools[index]);
            this.layersId.indexOf(charts.layersId[index]) < 0 && this.layersId.push(charts.layersId[index]);
            this.plotIds.indexOf(charts.plotIds[index]) < 0 && this.plotIds.push(charts.plotIds[index]);
          }
        });
        this.$options.service.chartsReady();
        this.loadindcharts = false;
      },
      resize(){
        try {
          this.plotly_divs.forEach(plot_div =>{
            const content_div = this.$refs[plot_div][0];
            Plotly.Plots.resize(content_div);
            this.setChartPlotHeigth(content_div);
          });
          Plotly.Plots.react();
        } catch (e) {}
      },
      setChartPlotHeigth(content_div){
        setTimeout(()=>{
          const jqueryContent = $(content_div);
          content_div.style.height = `${jqueryContent.parent().outerHeight() - jqueryContent.siblings().outerHeight()}px`;
        })
      },
      drawPlotlyChart({index, plot_div, replace=false}={}){
        if (this.draw) {
          const config = this.$options.service.getChartConfig();
          const content_div = this.$refs[plot_div][0];
          console.log(this.charts.data, plot_div)
          this.setChartPlotHeigth(content_div);
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
      async calculateHeigths(){
        return new Promise(async (resolve) =>{
          const dataLength = this.plotly_divs.length;
          const addedHeight = (this.relationData && this.relationData.height ? (dataLength > 1 ? dataLength * 50: 0) : (dataLength > 2 ? dataLength - 2 : 0) * 50 );
          this.height = 100 + addedHeight;
          await this.$nextTick();
          this.overflowY = addedHeight > 0 ? 'auto' : 'none';
          resolve();
        })
      },
      handleCharts(charts){
        this.replaceAddExistingCharts(charts);
      },
      async handleDataLayout({charts={}}={}){
        this.show = false;
        await this.handleCharts(charts);
        const dataLength = this.charts.data.length;
        this.show = dataLength > 0;
        this.$nextTick();
        if (this.draw && this.show) {
          await this.calculateHeigths();
          this.plotly_divs.forEach((plot_div, index) =>{
            this.drawPlotlyChart({
              index,
              plot_div
            });
          });
        }
        await this.$nextTick();
        // call ready
        this.$options.service.chartsReady();
      },
      async showMapFeaturesCharts(){
        const charts = await this.$options.service.showMapFeaturesAllCharts(true);
        charts && this.replaceAddExistingCharts(charts);
      }
    },
    beforeCreate(){
      this.delayType = 'debounce';
    },
    created(){
      this.charts = {
        plotIds: [],
        data: [],
        filters: [],
        layout: []
      }
    },
    async mounted(){
      await this.$nextTick();
      this.getCharts = ({charts}) =>{
        this.handleDataLayout({
          charts
        })
      };
      this.$options.service.on('change-charts', this.getCharts);
      this.$options.service.on('show-hide-chart', this.showHideChart);
      const charts = await this.$options.service.getCharts({
        layerIds: this.$options.ids,
        relationData: this.relationData
      });
      this.show = charts.data.length > 0;
      if (this.show) {
        await this.handleDataLayout({
          charts
        });
        this.relationData && GUI.on('pop-content', this.resize);
      } else this.$options.service.chartsReady();
    },
    beforeDestroy() {
      this.draw = false;
      this.$options.service.off('change-charts', this.getCharts);
      this.$options.service.off('show-hide-chart', this.showHideChart);
      this.relationData && GUI.off('pop-content', this.resize);
      this.$options.service.clearLoadedPlots();
      this.charts = null;
      this.draw = null;
    }
  }
</script>

<style scoped>
</style>
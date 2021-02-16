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
          :index="index" :layerId="layersId[index]" :tools="!relationData && tools[plotly_div]" :title="titles[plotly_div]" :filters="filters[plotly_div]">
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
        if (!this.state.tools.map.toggled && plotIds.length > 0) {
          const charts = await this.$options.service.showMapFeaturesSubPlotsCharts(plotIds);
          this.replaceExistingCharts(charts);
        } else this.showMapFeaturesCharts(false)
      },
      findChartIndex(plotId){
        let index;
        this.charts.plotIds.find((id, idx) => {
          if (id === plotId){
            index = idx;
            return true
          }
        });
        return index;
      },
      getPlotlyIdByIndex(index){
        return `plot_div_${index}`;
      },
      /*
      action: 'show', 'hide'
      * */
      async showHideChart({plotId, action, filter}={}){
        const index = this.findChartIndex(plotId);
        const plotly_div_id = this.getPlotlyIdByIndex(index);
        switch(action){
          case 'hide':
            this.plotly_divs = this.plotly_divs.filter(plot_div => plot_div !== plotly_div_id);
            this.show = this.plotly_divs.length > 0;
            this.filters[plotly_div_id] = filter;
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
            this.plotly_divs.splice(index, 0, plotly_div_id);
            await this.$nextTick();
            this.calculateHeigths();
            this.drawPlotlyChart(index);
            this.plotly_divs.forEach((plot_div, _index) =>{
              if (_index !== index) {
                const content_div = this.$refs[plot_div][0];
                this.setChartPlotHeigth(content_div);
              }
            });
            break;
        }
        this.show && this.resize();
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
      async clearPlotlyData(){
        this.plotly_divs.forEach(plot_div =>{
          const content_div = this.$refs[plot_div][0];
          Plotly.purge(content_div)
        });
        this.plotly_divs.splice(0);
        this.filters.splice(0);
        this.titles = {};
        this.tools = {};
        await this.$nextTick();
      },
      setChartPlotHeigth(content_div){
        setTimeout(()=>{
          const jqueryContent = $(content_div);
          content_div.style.height = `${jqueryContent.parent().outerHeight() - jqueryContent.siblings().outerHeight()}px`;
        })
      },
      drawPlotlyChart(index, replace=false){
        if (this.draw) {
          const config = this.$options.service.getChartConfig();
          const content_div = this.$refs[this.getPlotlyIdByIndex(index)][0];
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
      async handleDataLayout({charts={}}={}){
        this.show = false;
        this.charts = charts;
        const dataLength = this.charts.data.length;
        this.show = dataLength > 0;
        this.$nextTick();
        await this.clearPlotlyData();
        if (this.draw && this.show) {
          for (let i=0; i < dataLength; i++){
            const plot_div_id = this.getPlotlyIdByIndex(i);
            this.plotly_divs.push(plot_div_id);
            Vue.set(this.titles, plot_div_id, charts.layout[i].title.toUpperCase());
            Vue.set(this.filters, plot_div_id, charts.filters[i]);
            Vue.set(this.tools, plot_div_id, charts.tools[i]);
            this.layersId.indexOf(charts.layersId[i]) < 0 && this.layersId.push(charts.layersId[i]);
            this.plotIds.indexOf(charts.plotIds[i]) < 0 && this.plotIds.push(charts.plotIds[i]);
          }
          await this.calculateHeigths();
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
      this.$options.service.on('show-hide-chart', this.showHideChart);

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
      this.$options.service.off('show-hide-chart', this.showHideChart);
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
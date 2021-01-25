import { charts as chartsConfig } from './config/app'
import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR ,debounce} =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const ApplicationState = g3wsdk.core.ApplicationState;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const CatalogLayersStoresRegistry = g3wsdk.core.catalog.CatalogLayersStoresRegistry;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.loadedplots = {};
  this.loading = false;
  this.state = Vue.observable({
    loading: false,
    geolayer: false,
    tools: {
      map: {
        toggled: false
      }
    }
  });
  this.reloaddata = false;
  this.relationData = null;
  this._relations = {};
  this._relationIdName = {};
  this.customParams = {
    bbox: undefined
  };
  this.init = function(config={}){
   this.config = config;
   const layersId = new Set();
   this.chartContainers = [];
   this.config.plots.forEach((plot, index)=>{
     plot.show = index === 0;
     plot.withrelations = null;
     plot.request = true;
     plot.plot.layout._title = plot.plot.layout.title;
     plot.label = plot.plot.layout.title ||  `Plot id [${plot.id}]`;
     // set automargin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     plot.filters = {
       in_bbox: false,
       filtertoken: false,
       'relation.filtertoken': false,
       'relation.in_bbox': false
     };
     //end automargin
     layersId.add(plot.qgs_layer_id);
   });
   this.changeChartsEventHandler = async () =>{
     this.reloaddata = true;
     this.setBBoxParameter();
     try {
       await this.getChartsAndEmit();
     } catch(e){}
     this.reloaddata = false;
   };
   // listen layer change filter to reload the charts
   layersId.forEach(layerId => {
     const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
     if (layer.isFather() && this._relations[layerId] === undefined){
       const relations = [];
       layer.getRelations().getArray().forEach(relation =>{
         relation.getFather() === layerId && relations.push({
           id: relation.getId(),
           relationLayer: relation.getChild()
         });
         this._relationIdName[relation.getId()] = relation.getName();
       });
       this._relations[layerId] = relations;
     }
     layer.on('filtertokenchange', this.changeChartsEventHandler)
   });
   BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;
   this.loadscripts();
   const queryResultService = GUI.getComponent('queryresults').getService();
   this.showChartsOnContainer = (ids, container, relationData) => {
     const find = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
     !find && this.chartContainers.push({
       container,
       component: null
     });
     this.showChart(!find, ids, container, relationData);
   };

   this.clearChartContainers = container => {
     this.chartContainers = this.chartContainers.filter(queryResultsContainer =>  {
       if (!container || (container.selector === queryResultsContainer.container.selector)) {
           $(queryResultsContainer.component.$el).remove();
           queryResultsContainer.component.$destroy();
          return false
         } else return true;
     });
   };

   queryResultService.addLayersPlotIds([...layersId]);
   queryResultService.on('show-chart', this.showChartsOnContainer);
   queryResultService.on('hide-chart', this.clearChartContainers);
   this.closeComponentKeyEevent = queryResultService.onafter('closeComponent', this.clearChartContainers)
  };

  this.createSideBarComponent = function(){
    const vueComponentObject = MultiPlot({
      service : this
    });
    const QPlotlySiderBarComponent = ComponentsFactory.build(
      {
        vueComponentObject
      },
      {
        id: 'qplotly',
        title: 'plugins.qplotly.title',
        open: false,
        collapsible: true,
        iconColor: 'red',
        icon: GUI.getFontClass('chart-area'),
        mobile: true,
        events: {
          open: {
            when: 'before',
            cb: bool => this.showChart(bool)
          }
        }
      }
    );
    const options = {
      position: 1
    };

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', options);

    this.mapService.onbefore('controlClick', ({target})=>{
      if (target.name !== 'zoombox' && QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.click({
          open: false
        });
      }
    });

    this.once('clear', () => GUI.removeComponent('qplotly', 'sidebar', options));
  };

  //load scripts from server
  this.loadscripts = async function(){
    for (const script of this.config.jsscripts) {
      const promise = new Promise((resolve, reject) => {
        $.getScript(script)
          .done(() => resolve())
          .fail(() => reject())
      });
      await promise;
    }
    this.emit('ready');
  };

  this.showPlot = async function(plot){
    const id = plot.id;
    const type = plot.plot.type;
    if (chartsConfig.no_subplots.indexOf(type) !== -1) {
      this.config.plots.forEach(plot => {
        if (plot.id !== id)  plot.show = false
      })
    } else {
      this.config.plots.forEach(plot => {
        if (chartsConfig.no_subplots.indexOf(plot.plot.type) !== -1)  plot.show = false
      })
    }
    await this.getChartsAndEmit();
  };

  this.getChartsAndEmit = async function(){
    const charts = await this.getCharts();
    this.emit('change-charts', charts);
  };

  this.hidePlot = async function(){
   await this.getChartsAndEmit();
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.clearLoadedPlots = function () {
    this.loadedplots = {};
    this.state.tools.map.toggled = false;
    this.customParams.bbox = undefined;
    this.mapService.getMap().un('moveend', this.changeChartsEventHandler);
  };

  this.setBBoxParameter = function(){
    this.customParams.bbox = this.state.tools.map.toggled ? this.mapService.getMapBBOX().toString() : undefined;
  };

  this.showMapFeaturesCharts = async function(){
    this.reloaddata = true;
    this.state.tools.map.toggled = !this.state.tools.map.toggled;
    this.setBBoxParameter();
    this.state.tools.map.toggled ?
      this.mapService.getMap().on('moveend', this.changeChartsEventHandler) :
      this.mapService.getMap().un('moveend', this.changeChartsEventHandler);
    try {
      const charts = await this.getCharts();
      this.emit('change-charts', charts);
    } catch(e){}
    this.reloaddata = false;
  };

  this.resetPlotDynamicValues = function(){
    this.config.plots.forEach(plot  => {
      plot.withrelations = null;
      plot.request = true;
      plot.filters = {
        in_bbox: false,
        filtertoken: false,
        'relation.in_bbox': false,
        'relation.filtertoken': false
      }
    })
  };

  this.getCharts = async function(ids, relationData){
    this.relationData = this.reloaddata ? this.relationData : relationData;
    if (this.relationData) this.state.loading = true;
    !ids && await GUI.setLoadingContent(true);
    this.resetPlotDynamicValues();
    return new Promise((resolve) => {
      const plots = ids ? this.config.plots.filter(plot => ids.indexOf(plot.qgs_layer_id) !== -1) : this.config.plots.filter(plot => plot.show);
      const charts = {
        data: [],
        layout: [],
        plotIds: [],
        filters: []
      };
      // set plot id to show
      if (plots.length > 1) {
        const layerwithrelations = []; // useful to save refence layerid arlarey used to ask relation chartts
        plots.forEach(plot => {
          const children = layerwithrelations.indexOf(plot.qgs_layer_id) < 0 && this._relations[plot.qgs_layer_id];
          if (children) {
            plot.withrelations = [];
            children && children.forEach(({id, name,  relationLayer}) =>{
              plots.forEach(_plot => {
                _plot.request = !(_plot.qgs_layer_id === relationLayer);
                !_plot.request && plot.withrelations.push(id);
              });
            });
            if (plot.withrelations.length === 0) plot.withrelations = null;
            else layerwithrelations.push(plot.qgs_layer_id);
          }
        })
      }
      // set geo layer show or not
      this.state.geolayer = !!plots.find(plot => {
        const layer = CatalogLayersStoresRegistry.getLayerById(plot.qgs_layer_id);
        return layer.isGeoLayer();
      });

      if (Promise.allSettled) {
        const promises = [];
        plots.forEach(plot => {
          const layer = CatalogLayersStoresRegistry.getLayerById(plot.qgs_layer_id);
          plot.filters.filtertoken = layer.getFilterActive();
          let promise;
          // in case of no request (relation)
          if (!plot.request) {
            promise = Promise.resolve({
              result: true,
              relation:true
            });
          }
          else {
            const withrelations = plot.withrelations && plot.withrelations.length ? plot.withrelations.join(',') : undefined;
            const relationonetomany = this.relationData ? `${this.relationData.relations.find(relation => plot.qgs_layer_id === relation.referencingLayer).id}|${this.relationData.fid}` : undefined;
            const in_bbox = this.customParams.bbox;
            plot.filters.in_bbox = !!in_bbox;
            promise = !this.reloaddata && this.loadedplots[plot.id] ? Promise.resolve(this.loadedplots[plot.id]) : XHR.get({
              url: `${BASEQPLOTLYAPIURL}/${plot.id}`,
              params: {
                withrelations,
                filtertoken: ApplicationState.tokens.filtertoken || undefined,
                relationonetomany,
                in_bbox
              }
            });
          }
          promises.push(promise);
        });
        Promise.allSettled(promises)
          .then(async promisesData =>{
            const alreadyusedindex = [];
            promisesData.forEach((promise, rootindex) =>{
              let plot;
              if (promise.status === 'fulfilled' && promise.value.result) {
                const {data, relation, relations} = promise.value;
                if (relation) return; // in case of relation do nothing
                if (relations) {
                  Object.keys(relations).forEach( relationId =>{
                    const relationdata = relations[relationId];
                    relationdata.forEach(({id, data}) =>{
                      const fatherPlot = plots.find(plot => plot.withrelations && plot.withrelations.indexOf(relationId) !== -1);
                      const fatherPlotFilters = fatherPlot && fatherPlot.filters;
                      plots.find((plot, index) => {
                        if (plot.id === id){
                          const foundIndex = alreadyusedindex.find(_index => _index.index === index);
                          if (!foundIndex) alreadyusedindex.push({
                            index, count:1
                          });
                          else {
                            foundIndex.count+=1;
                            rootindex = rootindex < index ? rootindex : rootindex + foundIndex.count;
                          }
                          const _index = foundIndex ? index+foundIndex.count : index;
                          const layout = plot.plot.layout;
                          layout.title = `${this._relationIdName[relationId]} ${layout._title}`;
                          charts.data[_index] = data[0];
                          if (fatherPlotFilters) {
                            plot.filters['relation.in_bbox'] = fatherPlotFilters.in_bbox;
                            plot.filters['relation.filtertoken'] = fatherPlotFilters.filtertoken;
                          }
                          charts.filters[_index] = plot.filters;
                          charts.layout[_index] = layout;
                          charts.plotIds[_index] = plot.id;
                          return true;
                        }
                      });
                    })
                  });
                }
                plot = plots[rootindex];
                plot.plot.layout.title = plot.plot.layout._title;
                /*this.loadedplots[plot.id] = {
                  result: true,
                  data
                };*/
                charts.data[rootindex] = data[0] ;
                charts.filters[rootindex] = plot.filters;
                charts.layout[rootindex] = plot.plot.layout;
                charts.plotIds[rootindex] = plot.id;
              } else  {
                plot = plots[rootindex];
                charts.data[rootindex] = null;
                charts.filters[rootindex] = plot.filters;
                charts.plotIds[rootindex] = plot.id;
              }
            });
            !ids && await GUI.setLoadingContent(false);
            if (this.relationData) this.state.loading = false;
            resolve(charts);
          })
      }
    });
    return promise;
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool, ids, container, relationData){
    if (bool) {
      setTimeout(()=>{
        const content =  new QPlotlyComponent({
          service: this,
          ids,
          relationData
        });
        if (container) {
          const component = content.getInternalComponent();
          component.$once('hook:mounted', async function(){
            container.append(this.$el);
            GUI.emit('resize');
          });
          component.$mount();
          this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
        } else {
          this.mapService.deactiveMapControls();
          GUI.showContent({
            closable: false,
            title: 'plugins.qplotly.title',
            content,
            perc: 50
          });
        }
      }, 300)
    } else {
      if (container)
        this.clearChartContainers(container);
      else GUI.closeContent();
    }
  };

  this.clear = function(){
    this.emit('clear');
    // listen layer change filter to reload the charts
    layersId.forEach(layerId => {
      const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
      layer.off('filtertokenchange', this.changeChartWhenFilterChange)
    });
    this.mapService = null;
    this.chartContainers = [];
    const queryResultService = GUI.getComponent('queryresults').getService();
    queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    GUI.closeContent();
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 
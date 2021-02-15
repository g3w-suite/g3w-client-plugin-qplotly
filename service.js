import MultiPlot from './components/sidebar/multiplot';
const { base, inherit, XHR } =  g3wsdk.core.utils;
const GUI = g3wsdk.gui.GUI;
const ApplicationState = g3wsdk.core.ApplicationState;
const ComponentsFactory = g3wsdk.gui.ComponentsFactory;
const PluginService = g3wsdk.core.plugin.PluginService;
const CatalogLayersStoresRegistry = g3wsdk.core.catalog.CatalogLayersStoresRegistry;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  this.setters = {
    chartsReady(){} // hook called when chart is show
  };
  base(this);
  this.mapService = GUI.getComponent('map').getService();
  this.loadedplots = {};
  this.loading = false;
  this.showCharts = false;
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
  this.keyMapMoveendEvent = {
    key: null,
    plotIds: []
  };
  this.mainbboxtool = false;
  let layersId = new Set();
  this.init = function(config={}){
    this.config = config;
    this.chartContainers = [];
    this.changeChartsEventHandler = async ({layerId}={}) =>{
      // change if one of these condition is true
      const change = this.showCharts && !this.relationData && !!this.config.plots.find(plot=> this.customParams.bbox || plot.qgs_layer_id === layerId && plot.show);
      // in case of a filter is change on showed chart it redraw the chart
      if (change) {
        const subplots = this.keyMapMoveendEvent.plotIds.length > 0;
        subplots && this.keyMapMoveendEvent.plotIds.forEach(plotId => {
          const plot = this.config.plots.find(plot => plot.id !== plotId);
          if (plot) plot.loaded = false;
        });
        this.reloaddata = true;
        this.setBBoxParameter(subplots);
        try {
          await this.getChartsAndEmit({subplots});
        } catch(e){}
        this.reloaddata = false;
      } else if (layerId) {
        const plot = this.config.plots.find(plot => plot.id === layerId);
        plot.loaded = false;
      }
    };
    this.config.plots.forEach((plot, index)=>{
     plot.show = index === 0;
     plot.withrelations = null;
     plot.request = true;
     plot.loaded = plot.show;
     plot.plot.layout._title = plot.plot.layout.title;
     plot.label = plot.plot.layout.title ||  `Plot id [${plot.id}]`;
     // set automargin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     plot.filters = [];
     const layerId = plot.qgs_layer_id;
     //end automargin
     layersId.add(layerId);
     // listen layer change filter to reload the charts
     const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
     plot.tools = {
       filter: layer.getFilter(),
       selection: layer.getSelection(),
       geolayer: {
         show: layer.isGeoLayer(),
         active: false
       }
     };
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
            cb: async bool => {
              bool && GUI.disableSideBar(true);
              await this.showChart(bool);
              bool ? setTimeout(()=>{
                GUI.disableSideBar(false);
              },500) : this.config.plots.forEach(plot => plot.loaded = false);
            }
          }
        }
      }
    );
    const options = {
      position: 1
    };

    GUI.addComponent(QPlotlySiderBarComponent, 'sidebar', options);

    /*this.mapService.onbefore('controlClick', ({target})=>{
      if (target.name !== 'zoombox' && QPlotlySiderBarComponent.getOpen()) {
        QPlotlySiderBarComponent.click({
          open: false
        });
      }
    });*/

    this.once('clear', () => GUI.removeComponent('qplotly', 'sidebar', options));
  };

  this.toggleLayerFilter = function(layerId){
    const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
    layer && layer.toggleFilterToken();
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

  this.setActivePlotToolGeolayer = function(plot){
    if (plot.tools.geolayer.active) plot.filters.length ? plot.filters[0] = 'in_bbox_filtertoken' : plot.filters.push('in_bbox');
  };

  this.getChartsAndEmit = async function({subplots=false} ={}){
    const charts = await this.getCharts();
    this.emit('change-charts', {
      charts,
      subplots
    });
  };

  this.showPlot = async function(plot){
    plot.tools.geolayer.active =  this.state.tools.map.toggled;
    if (this.keyMapMoveendEvent.key){
      this.keyMapMoveendEvent.plotIds.push({
        id: plot.id,
        active: this.state.tools.map.toggled
      })
    }
    if (plot.loaded) this.emit('show-hide-chart', {plotId:plot.id, action: 'show'});
    else {
      await this.getChartsAndEmit();
      plot.loaded = true;
    }
  };

  this.hidePlot = async function(plot){
    if (this.keyMapMoveendEvent.key) this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plot.id !== plotId.id);
    if (this.keyMapMoveendEvent.plotIds.length === 0) {
      this.customParams.bbox = void 0;
      this.state.tools.map.toggled = false;
    }
    this.emit('show-hide-chart', {
      plotId:plot.id,
      action: 'hide'
    } );
    //await this.getChartsAndEmit();
  };

  this.getPlots = function(){
    return this.config.plots;
  };

  this.clearLoadedPlots = function() {
    this.loadedplots = {};
    this.state.tools.map.toggled = false;
    this.customParams.bbox = undefined;
    this.handleKeyMapMoveendEvent({
      listen: false
    });
    this.config.plots.forEach(plot => {
      plot.tools.geolayer.active = false;
      plot.filters = []
    });
    this.showCharts = false;
  };

  this.setBBoxParameter = function(force=false){
    this.customParams.bbox = force || this.state.tools.map.toggled ? this.mapService.getMapBBOX().toString() : undefined;
  };

  this.showMapFeaturesSubPlotsCharts = async function(plotIds=[]){
    this.mainbboxtool = false;
    this.setBBoxParameter(true);
    this.handleKeyMapMoveendEvent({
      listen:true,
      plotIds
    });
    return await this.getCharts()
  };

  this.handleKeyMapMoveendEvent = function({listen=false, plotIds=[]}={}){
    if (listen) {
      this.keyMapMoveendEvent.plotIds = plotIds;
      this.keyMapMoveendEvent.key =  this.keyMapMoveendEvent.key || this.mapService.getMap().on('moveend', this.changeChartsEventHandler);
    } else {
      ol.Observable.unByKey(this.keyMapMoveendEvent.key);
      this.keyMapMoveendEvent.key = null;
      this.keyMapMoveendEvent.plotIds = [];
    }
  };

  // methods reload chart data for every charts
  this.showMapFeaturesAllCharts = async function(change){
    this.mainbboxtool = true;
    this.reloaddata = true;
    this.state.tools.map.toggled = change ? !this.state.tools.map.toggled: this.state.tools.map.toggled;
    this.setBBoxParameter();
    const plotIds = this.config.plots.filter(plot => {
      plot.tools.geolayer.active = this.state.tools.map.toggled;
      return plot.show && plot.tools.geolayer.active
    }).map(plot => ({
        id: plot.id,
        active: true
    }));
    this.handleKeyMapMoveendEvent({
      listen: this.state.tools.map.toggled,
      plotIds
    });
    try {
      const charts = await this.getCharts();
      this.emit('change-charts', {
        charts,
        subplots: false
      });
    } catch(e){}
    this.reloaddata = false;
    return this.state.tools.map.toggled;
  };

  this.resetPlotDynamicValues = function(){
    this.config.plots.forEach(plot  => {
      plot.withrelations = null;
      plot.request = true;
      plot.filters = [];
    })
  };

  this.getCharts = async function({layerIds, relationData}={}){
    this.relationData = this.reloaddata ? this.relationData : relationData;
    if (this.relationData) this.state.loading = true;
    if (!layerIds) await GUI.setLoadingContent(true);
    this.onceafter('chartsReady', async ()=>{
      if (!layerIds) await GUI.setLoadingContent(false);
      if (this.relationData) this.state.loading = false;
    });
    this.resetPlotDynamicValues();
    return new Promise(resolve => {
      const plots = layerIds || this.keyMapMoveendEvent.plotIds.length > 0 ?
        (this.config.plots.filter(plot => layerIds ? layerIds.indexOf(plot.qgs_layer_id) !== -1:
        this.keyMapMoveendEvent.plotIds.map(plotId => plotId.id).indexOf(plot.id) !== -1)) :
        this.config.plots.filter(plot => plot.show);
      const charts = {
        data: [],
        layout: [],
        plotIds: [],
        layersId: [],
        filters: [],
        tools: []
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
      // set main map visibile filter tool
      this.state.geolayer = !!plots.find(plot => plot.tools.geolayer.show);
      if (Promise.allSettled) {
        const promises = [];
        plots.forEach(plot => {
          const layer = CatalogLayersStoresRegistry.getLayerById(plot.qgs_layer_id);
          layer.getFilterActive() && plot.filters.push('filtertoken');
          let promise;
          // in case of no request (relation)
          if (!plot.request) {
            promise = Promise.resolve({
              result: true,
              relation:true
            });
          } else {
            const addInBBoxParam = this.keyMapMoveendEvent.plotIds.length > 0 ? this.keyMapMoveendEvent.plotIds.filter(plotIds => plotIds.active).map(plotId => plotId.id).indexOf(plot.id) !== -1 : true;
            const withrelations = plot.withrelations && plot.withrelations.length ? plot.withrelations.join(',') : undefined;
            const relationonetomany = this.relationData ? `${this.relationData.relations.find(relation => plot.qgs_layer_id === relation.referencingLayer).id}|${this.relationData.fid}` : undefined;
            const in_bbox = addInBBoxParam ? this.customParams.bbox : void 0;
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
                          if (fatherPlotFilters.length) plot.filters.push(`relation.${fatherPlotFilters[0]}`);
                          this.setActivePlotToolGeolayer(plot);
                          charts.filters[_index] = plot.filters;
                          charts.layout[_index] = layout;
                          charts.plotIds[_index] = plot.id;
                          charts.tools[_index] = plot.tools;
                          charts.layersId[_index] = plot.qgs_layer_id;
                          return true;
                        }
                      });
                    })
                  });
                }
                plot = plots[rootindex];
                plot.plot.layout.title = plot.plot.layout._title;
                charts.data[rootindex] = data[0] ;
                this.setActivePlotToolGeolayer(plot);
                charts.filters[rootindex] = plot.filters;
                charts.layout[rootindex] = plot.plot.layout;
                charts.plotIds[rootindex] = plot.id;
                charts.tools[rootindex] = plot.tools;
                charts.layersId[rootindex] = plot.qgs_layer_id;
              } else  {
                plot = plots[rootindex];
                charts.data[rootindex] = null;
                this.setActivePlotToolGeolayer(plot);
                charts.filters[rootindex] = plot.filters;
                charts.plotIds[rootindex] = plot.id;
                charts.tools[rootindex] = plot.tools;
                charts.layersId[rootindex] = plot.qgs_layer_id;
              }
            });
            this.showCharts = true;
            this.removeInactivePlotIds();
            resolve(charts);
          })
      }
    });
  };

  this.removeInactivePlotIds = function(){
    if (!this.state.tools.map.toggled){
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plotId.active);
      this.keyMapMoveendEvent.plotIds.length === 0 && this.keyMapMoveendEvent.key && this.handleKeyMapMoveendEvent({listen: false});
    }
  };

  this.getChartLayout = function (id) {
    return this.config.plots[0].layout;
  };

  this.getChartConfig = function(id){
    return this.config.plots[0].config;
  };

  this.showChart = function(bool, ids, container, relationData){
    return new Promise(resolve =>{
      if (bool) {
        setTimeout(()=>{
          const content =  new QPlotlyComponent({
            service: this,
            ids,
            relationData
          });
          const component = content.getInternalComponent();
          if (container) {
            component.$once('hook:mounted', async function(){
              container.append(this.$el);
              GUI.emit('resize');
            });
            component.$mount();
            this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
          } else {
            // called from sidebar component
            this.onceafter('chartsReady', ()=> {
              resolve()
            });
            //this.mapService.deactiveMapControls();
            GUI.showContent({
              closable: false,
              title: 'plugins.qplotly.title',
              style: {
                title: {
                  fontSize: '1.3em',
                  marginBottom: '20px'
                }
              },
              content,
              perc: 50
            });
          }
        })
      } else {
        if (container) this.clearChartContainers(container);
        else GUI.closeContent();
        resolve();
      }
    })
  };

  this.clear = function(){
    GUI.removeComponent('qplotly', 'sidebar', {position: 1});
    this.emit('clear');
    // listen layer change filter to reload the charts
    layersId.forEach(layerId => {
      const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
      layer && layer.off('filtertokenchange', this.changeChartWhenFilterChange)
    });
    this.mapService = null;
    this.chartContainers = [];
    const queryResultService = GUI.getComponent('queryresults').getService();
    queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    GUI.closeContent();
    layersId = null;
    this.mainbboxtool = null;
  };
}

inherit(Service, PluginService);

module.exports = new Service;

 
import HeaderContentAction from './components/content/headeraction.vue';
const { base, inherit, XHR , debounce, toRawType} =  g3wsdk.core.utils;
const {GUI} = g3wsdk.gui;
const {ApplicationState} = g3wsdk.core;
const {PluginService} = g3wsdk.core.plugin;
const {CatalogLayersStoresRegistry} = g3wsdk.core.catalog;
const QPlotlyComponent = require('./components/content/qplotly');
let BASEQPLOTLYAPIURL = '/qplotly/api/trace';

function Service(){
  this.setters = {
    chartsReady(){} // hook called when chart is show
  };
  base(this);
  // get mapService
  this.mapService = GUI.getService('map');
  // get current map CRS
  this.mapCrs = this.mapService.getCrs();
  // initialize load plots as empty Object
  this.loadedplots = {};
  //Initial state is false
  this.loading = false;
  //Initial state is false
  this.showCharts = false;
  // set state of plugin reactive using Vue.observable
  this.state = Vue.observable({
    loading: false, // loading purpose
    geolayer: false,
    positions: [],
    tools: {
      map: {
        toggled: false,
        disabled: false
      }
    }
  });
  //initial state is false
  this.reloaddata = false;
  // relation data
  this.relationData = null;
  this._relationIdName = {};
  this.customParams = {
    bbox: undefined
  };
  //store Openlayers key event for map moveend
  this.keyMapMoveendEvent = {
    key: null,
    plotIds: []
  };
  this.mainbboxtool = false;
  let layersId = new Set();
  // init method service
  this.init = function(config={}){
    // get config
    this.config = config;
    // charts container coming from query results
    this.chartContainers = [];
    //event handler of change chart
    this.changeChartsEventHandler = debounce(async ({layerId}) =>{
      // change if one of these condition is true
      const change = this.showCharts && !this.relationData && !!this.config.plots.find(plot=> this.customParams.bbox || plot.qgs_layer_id === layerId && plot.show);
      // in case of a filter is change on showed chart it redraw the chart
      if (change) {
        const plotreload = [];
        const subplots = this.keyMapMoveendEvent.plotIds.length > 0;

        subplots && this.keyMapMoveendEvent.plotIds.forEach(plotId => {
          const plot = this.config.plots.find(plot => plot.id === plotId.id);
          plot.loaded = false;
          plotreload.push(plot);
        });
        this.reloaddata = true;

        this.setBBoxParameter(subplots);

        try {
          const plotIds = subplots && this.getPlotsIdsToLoad({
            plots: plotreload,
            use: true
          }) || undefined;

          await this.getChartsAndEmit({
            plotIds
          });

        } catch(e){}
        this.reloaddata = false;

      } else if (layerId) {

        const plot = this.config.plots.find(plot => plot.qgs_layer_id === layerId);

        plot.loaded = false;
      }
    }, 1500);
    //loop over plots
    this.config.plots.forEach((plot, index)=> {
      // in case of title is an object get text attribute otherwise get title
      //It is necessary depend of which plotly library version is installed on server
     const title = toRawType(plot.plot.layout.title) === 'Object' ? plot.plot.layout.title.text : plot.plot.layout.title;
     //add plot id
     this.state.positions.push(plot.id);
     //set relation to null
     plot.withrelations = null;
     plot.request = true;
     plot.loaded = plot.show;
     plot.plot.layout._title = title ;
     plot.label = title ||  `Plot id [${plot.id}]`;
     // set auto margin
     plot.plot.layout.xaxis.automargin = true;
     plot.plot.layout.yaxis.automargin = true;
     //end auto margin
     plot.filters = [];
     // get layer id
     const layerId = plot.qgs_layer_id;
     //add to Array layerId
     layersId.add(layerId);
     // listen layer change filter to reload the charts
     const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
     // check if layer has geomety
     const geolayer = layer.isGeoLayer();
     plot.crs = geolayer ? layer.getCrs() : undefined;
     plot.tools = {
       filter: layer.getFilter(), // get reactive layer filter attribute : {filter: {active: <Boolean>}}
       selection: layer.getSelection(), // get reactive layer selection attribute : {selection: {active: <Boolean>}}
       geolayer: {
         show: geolayer, // if is geolayer show map tool
         active: false // start to false
       }
     };
     // check if a layer has child (relation)
     if (layer.isFather()) {
       const relations = [];
       layer.getRelations().getArray().forEach(relation =>{
         relation.getFather() === layerId && relations.push({
           id: relation.getId(), // relation id
           relationLayer: relation.getChild(), // relation layer child
           use: false // use to get data of related plot
         });
         this._relationIdName[relation.getId()] = relation.getName();
       });
       plot.withrelations = relations; // add Array relations
     }
     // listen layer change filtertokenchange
     layer.on('filtertokenchange', this.changeChartsEventHandler)

    });


    BASEQPLOTLYAPIURL = `${BASEQPLOTLYAPIURL}/${this.getGid()}`;

    this.queryResultService = GUI.getService('queryresults');

    /**
     * @since 3.5.2
     * @returns {number}
     */
    this.getNumberOfShowPlots = function(){
      return this.config.plots.filter(plot => plot.show).length;
    }

    /**
     * Method called from  queryResultService on 'show-chart' event
     * @param ids
     * @param container
     * @param relationData
     */
    this.showChartsOnContainer = (ids, container, relationData) => {
      const findContainer = this.chartContainers.find(queryresultcontainer => container.selector === queryresultcontainer.container.selector);
      if ("undefined" === typeof findContainer) {
        this.chartContainers.push({
          container,
          component: null
        });
      }
      this.showChart(("undefined" === typeof findContainer), ids, container, relationData);
    };
    // Emit plugin service is ready
    this.emit('ready');

    /**
     * Method to clear chart containers
     * @param container
     */
     this.clearChartContainers = (container) => {

       this.chartContainers = this.chartContainers.filter(queryResultsContainer =>  {
         if (!container || (container.selector === queryResultsContainer.container.selector)) {
           $(queryResultsContainer.component.$el).remove();
           queryResultsContainer.component.$destroy();
           return false
         } else return true;
       });
     };

     this.queryResultService.addLayersPlotIds([...layersId]);
     // listen show-chart event from query result service
     this.queryResultService.on('show-chart', this.showChartsOnContainer);
      // listen hide-chart event from query result service
     this.queryResultService.on('hide-chart', this.clearChartContainers);
     // get close component event key when component (right element where result are show is closed)
     this.closeComponentKeyEevent = this.queryResultService.onafter('closeComponent', this.clearChartContainers);

     this.setContentChartTools();
    };

  /**
   * Method to toggle filter token on project layer
   * @param layerId
   */
  this.toggleLayerFilter = function(layerId){
    const layer = CatalogLayersStoresRegistry.getLayerById(layerId);
    layer && layer.toggleFilterToken();
    this.updateCharts();
  };

  /**
   * TODO
   * @param plot
   */
  this.setActiveFilters = function(plot){
    plot.filters = [];
    plot.tools.filter.active && plot.filters.push('filtertoken');
    if (plot.tools.geolayer.active) {
      plot.filters.length > 0 ?
        plot.filters.splice(0, 1, 'in_bbox_filtertoken') :
        plot.filters.push('in_bbox');
    }
  };
  /**
   * TODO
   * @param plotIds
   * @returns {Promise<void>}
   */
  this.getChartsAndEmit = async function({plotIds} ={}){
    //get charts
    const {charts, order} = await this.getCharts({plotIds});
    // charts are change
    this.emit('change-charts', {charts, order})
  };

  //check if had to reload data of parent relation
  this.getPlotsIdsToLoad = function({plots=[], use=false}={}){
    let plotIds = [];
    plots.forEach(plot => {
      const plotIdsToLoad = this.getPlotIdsToLoad({
        plot,
        use
      });
      if (plotIdsToLoad.length > 0) {
        plotIdsToLoad.forEach(plotIdToLoad => {
          if ("undefined" === plotIds.find(ploId => plotIdsToLoad.id === plotIdToLoad.id)) {
            plotIds.push(plotIdToLoad);
          }
        })
      } else plotIds.push({
        id: plot.id,
        relation: false
      })
    });
    return plotIds;
  };

  /*
   use: <Boolen>
   * */
  this.getPlotIdsToLoad = function({plot, use}) {
    let reload = [];
    //// no relations belong to this plot
    if (null === plot.withrelations) {
      this.config.plots.forEach(_plot => {
        if (_plot.id !== plot.id && true === _plot.show) {
          const relations = _plot.withrelations;
          relations && relations.find((plotrelation, index) => {
            if (plotrelation.relationLayer === plot.qgs_layer_id){
              relations[index].use = use;
              reload.push({
                id: _plot.id,
                relation: false
              });
              return true
            }
          })
        }
      });
      use && reload.length && reload.push({
        id: plot.id,
        relation: true
      });
    } else { // if plot has relation (layer belong to plot has relation)
      // Loop through relation plots
      plot.withrelations.forEach((relationPlot) => {
        this.config.plots.forEach((plot) => {
          // check if plot is visible and if it has relation with this plot (layer)
          if (plot.show && plot.qgs_layer_id === relationPlot.relationLayer){
            relationPlot.use = use;
            // add to plot to reload
            reload.push({
              id: plot.id,
              relation: use
            });
          }
        });

        use && reload.length && reload.push({
          id: plot.id,
          relation: false
        })

      });
    }
    //return Array
    return reload;
  };

  /**
   * Method to show plot chart
   * @param plot
   * @returns {Promise<void>}
   */
  this.showPlot = async function(plot){
    // only if geolayer tools is show
    if (plot.tools.geolayer.show) {
      // get active boolean from map toggled
      plot.tools.geolayer.active = this.state.tools.map.toggled;
      if (this.keyMapMoveendEvent.key) {
        this.keyMapMoveendEvent.plotIds.push({
          id: plot.id,
          active: this.state.tools.map.toggled
        })
      }
    }

    /**
     *  set main map geolayer tools based on if there are plot belong to a geolayer
     */
    this.setContentChartTools();

    const chartstoreload = this.getPlotIdsToLoad({
      plot,
      use: plot.show // set true because plot
    });

    // if there are chart to reload
    if (chartstoreload.length > 0) {
      // in case of relations
      await this.getChartsAndEmit({
        plotIds: chartstoreload
      });
    } else {
      // create a charts object
      const {charts, order} = this.createChartsObject();
      // if already loaded
      if (plot.loaded) {
        // update charts
        await this.updateCharts();

        this.emit('show-hide-chart', {
          plotId: plot.id,
          action: 'show',
          charts,
          order
        });
      } else {
        // get data and emit
        await this.getChartsAndEmit({
          plotIds:[{
            id:plot.id,
            relation: false
          }]
        });
        plot.loaded = true;
      }
    }
  };

  /**
   * Method to hide plot chart
   * @param plot
   * @returns {Promise<void>}
   * */
  this.hidePlot = async function(plot){
    // check if geolayer tool (map) is show (geolayer)
    if (plot.tools.geolayer.show) {
      if (plot.tools.geolayer.active) {
        plot.loaded = false;
      }
      // deactive geolayer tools
      plot.tools.geolayer.active = false;
      if (this.keyMapMoveendEvent.key) {
        // remove map Move end from plotids keys
        this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plot.id !== plotId.id);
      }
      // if no plots have active geo tools
      if (this.keyMapMoveendEvent.plotIds.length === 0) {
        // set request params to undefined
        this.customParams.bbox = undefined;
        //un toggle main chart mao tool
        this.state.tools.map.toggled = false;
      }
    }
    this.setContentChartTools();
    // check if we had to reload based on relation
    const chartstoreload = this.getPlotIdsToLoad({
      plot,
      use: plot.show
    });

    this.setActiveFilters(plot);

    const {charts, order} = chartstoreload.length > 0 &&
      await this.getCharts({plotIds: chartstoreload}) ||
      this.createChartsObject();

    if (0 === chartstoreload.length) {
      await this.updateCharts();
    }

    this.emit('show-hide-chart', {
      plotId: plot.id,
      action: 'hide',
      filter: plot.filters,
      charts,
      order
    });
  };

  /**
   * TODO
   * @param order <Array/undefined> of plot ids
   * @returns {{charts: {}, order: (*|*[])}}
   */
  this.createChartsObject = function({order}={}){
    return {
      order: order || this.config.plots.filter(plot=> plot.show).map(plot => plot.id),
      charts: {}
    }
  };

  /**
   * Method to get charts plots of plugin configuration
   * @returns {[]|*}
   */
  this.getPlots = function(){
    return this.config.plots;
  };

  /**
   * TODO
   */
  this.clearLoadedPlots = function() {
    this.loadedplots = {};
    this.state.tools.map.toggled = false;
    this.customParams.bbox = undefined;
    this.handleKeyMapMoveendEvent({
      listen: false
    });
    this.config.plots.forEach(plot => {
      plot.tools.geolayer.active = false;
      plot.filters = [];
    });
    this.showCharts = false;
  };

  /**
   * TODO
   * @param force
   */
  this.setBBoxParameter = function(force=false){
    this.customParams.bbox = force || this.state.tools.map.toggled ? this.mapService.getMapBBOX().toString() : undefined;
  };

  /**
   * TODO
   * @param plotIds
   * @returns {Promise<unknown>}
   */
  this.showMapFeaturesSubPlotsCharts = async function(plotIds=[]){
    this.mainbboxtool = false;
    this.setBBoxParameter(true);
    this.handleKeyMapMoveendEvent({
      listen:true,
      plotIds
    });
    const _plotIds = plotIds.map(plotId => plotId.id);
    const plots = this.config.plots.filter(plot => {
      const find = _plotIds.find(plotId => plotId === plot.id);
      return find !== undefined;
    });

    return await this.getCharts({
      plotIds: this.getPlotsIdsToLoad({
        plots,
        use: true
      })
    });
  };

  /**
   * TODO
   * @param listen
   * @param plotIds
   */
  this.handleKeyMapMoveendEvent = function({listen=false, plotIds=[]}={}){
    if (listen) {
      // which plotIds need to be trigger the moveed map event
      this.keyMapMoveendEvent.plotIds = plotIds;
      // get map movend event just one time
      this.keyMapMoveendEvent.key =  this.keyMapMoveendEvent.key || this.mapService.getMap().on('moveend', this.changeChartsEventHandler);
    } else {
      // remove handler of moveend map
      ol.Observable.unByKey(this.keyMapMoveendEvent.key);
      this.keyMapMoveendEvent.key = null;
      // reset to empty
      this.keyMapMoveendEvent.plotIds = [];
    }
  };

  /**
   * Method reload chart data for every charts
   */
  this.showMapFeaturesAllCharts = async function(change=false){
    let charts;
    this.mainbboxtool = true;
    this.reloaddata = true;
    this.state.tools.map.toggled = change ? !this.state.tools.map.toggled: this.state.tools.map.toggled;
    this.setBBoxParameter();
    const activeGeolayerPlots = this.config.plots.filter(plot => {
      plot.tools.geolayer.active = plot.tools.geolayer.show && this.state.tools.map.toggled;
      return plot.show && (this.state.tools.map.toggled && plot.tools.geolayer.active || true)
    });
    this.handleKeyMapMoveendEvent({
      listen: this.state.tools.map.toggled,
      plotIds: activeGeolayerPlots.map(plot => ({
        id: plot.id,
        active: plot.tools.geolayer.active
      }))
    });
    try {
      // set use of relation based on map toggled or filtertoken active
      const use = this.state.tools.map.toggled || typeof ApplicationState.tokens.filtertoken !== 'undefined';
      const plotIds = this.getPlotsIdsToLoad({
        plots: activeGeolayerPlots,
        use
      });
      charts = await this.getCharts({
        plotIds
      });
    } catch(e){}
    this.reloaddata = false;
    return charts;
  };

  /**
   * method to set geo-layer tools true or false if some plot chart has geolayer show
   */
  this.setContentChartTools = function(){
    // if no show plot have geolayer tool to show (geolayer) hide charts geolayer tool
    this.state.geolayer = "undefined" !== typeof this.config.plots.find(plot => plot.show && plot.tools.geolayer.show);
  };

  /**
   *
   * @param layerIds
   * @returns {Promise<void>}
   */
  this.updateCharts = async function(layerIds){
    this.state.loading = true;

    if (!layerIds) {
      GUI.disableSideBar(true);
      await GUI.setLoadingContent(true);
    }
    this.onceafter('chartsReady', async ()=>{
      if (!layerIds) {
        GUI.disableSideBar(false);
        await GUI.setLoadingContent(false);
      }
      this.state.loading = false;
    });
  };

  /*
  * Method to get data chart from server
   */
  this.getCharts = async function({layerIds, plotIds, relationData}={}){
    // check if it has relation data
    this.relationData = this.reloaddata ? this.relationData : relationData;
    await this.updateCharts(layerIds);
    return new Promise(resolve => {
      let plots;
      if (layerIds) {
        plots = this.config.plots.filter(plot => layerIds.indexOf(plot.qgs_layer_id) !== -1);
      } else if (plotIds) {
        plots = this.config.plots.filter(plot => {
          const findplot = plotIds.find(plotId => plotId.id === plot.id);
          if (findplot) {
            plot.request = !findplot.relation;
            return true;
          }
          else return false;
        });
      } else plots = this.config.plots.filter(plot => plot.show);

      const chartsObject = this.createChartsObject({
        order: layerIds && plots.map(plot => plot.id)
      });
      // set main map visible filter tool
      // check if is supported
      if (Promise.allSettled) {
        const promises = [];
        const chartsplots = [];
        // set that register already relation loaded to avoid to replace the same plot multi time
        const relationIdAlreadyLoaded = new Set();
        plots.forEach(plot => {
          let promise;
          // in case of no request (relation) and not called from query
          if (!relationData && !plot.request) {
            promise = Promise.resolve({
              result: true,
              relation:true
            });
          } else {
            const addInBBoxParam = this.keyMapMoveendEvent.plotIds.length > 0 ?

              this.keyMapMoveendEvent.plotIds
                .filter(plotIds => plotIds.active)
                .map(plotId => plotId.id)
                .indexOf(plot.id) !== -1 :
              true;

            let withrelations;

            if (plot.withrelations) {
              const inuserelation = plot.withrelations.filter(plotrelation => {
                if (plotrelation.use && !relationIdAlreadyLoaded.has(plotrelation.id)) {
                  relationIdAlreadyLoaded.add(plotrelation.id);
                  return true;
                }
              });
              withrelations = inuserelation.length ? inuserelation.map(plotrelation => plotrelation.id).join(','): undefined;
            }
            let relationsonetomany = [undefined];
            let in_bbox;
            if (addInBBoxParam && this.customParams.bbox) in_bbox = this.customParams.bbox;

            if (this.relationData) {
              const chartsRelations = this.relationData.relations
                .filter(relation => plot.qgs_layer_id === relation.referencingLayer)
                .map(relation => `${relation.id}|${this.relationData.fid}`);
              relationsonetomany = chartsRelations.length ? chartsRelations : relationsonetomany;
            }
            relationsonetomany.forEach(relationonetomany => {
              chartsplots.push(plot);
              promise = !this.reloaddata && this.loadedplots[plot.id] ?

                Promise.resolve(this.loadedplots[plot.id]) :
                // server request data
                XHR.get({
                  url: `${BASEQPLOTLYAPIURL}/${plot.qgs_layer_id}/${plot.id}/`,
                  params: {
                    withrelations,
                    filtertoken: ApplicationState.tokens.filtertoken || undefined,
                    relationonetomany,
                    in_bbox
                  }
                });

              promises.push(promise);
            })
          }
        });
        // wait all promises
        Promise.allSettled(promises)
          .then(async promisesData => {
            promisesData.forEach((promise, index) => {
              // only if request has response
              if (promise.status === 'fulfilled' && promise.value.result) {
                const {data, relation, relations} = promise.value;
                if (relation) return; // in case of relation do nothing
                const plot = chartsplots[index];
                this.setActiveFilters(plot);
                // in case of multiple chart plot of same plot
                const chart = {};
                if (chartsObject.charts[plot.id]) {
                  chartsObject.charts[plot.id].push(chart);
                } else {
                  chartsObject.charts[plot.id] = [chart];
                }
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                plot.plot.layout.title = plot.plot.layout._title;
                chart.title = plot.plot.layout.title;
                chart.data = data[0];
                if (relations) {
                  Object.keys(relations).forEach(relationId => {
                    const relationdata = relations[relationId];
                    relationdata.forEach(({id, data}) => {
                      const fatherPlot = plots.find(plot => {
                        return plot.withrelations && "undefined" !== typeof plot.withrelations.find(plotrelation => plotrelation.id === relationId)
                      });
                      const fatherPlotFilters = fatherPlot && fatherPlot.filters;
                      plots.find((plot, index) => {
                        if (plot.id === id){
                          this.setActiveFilters(plot);
                          const chart = {};
                          if (chartsObject.charts[plot.id]) chartsObject.charts[plot.id].push(chart);
                          else chartsObject.charts[plot.id] = [chart];
                          const layout = plot.plot.layout;
                          layout.title = `${this._relationIdName[relationId]} ${layout._title}`;

                          if (fatherPlotFilters.length) {
                            plot.filters.push(`relation.${fatherPlotFilters[0]}`);
                          }
                          chart.data = data[0];
                          chart.filters= plot.filters;
                          chart.layout = layout;
                          chart.tools = plot.tools;
                          chart.layerId = plot.qgs_layer_id;
                          chart.title = plot.plot.layout.title;
                          return true;
                        }
                      });
                    })
                  });
                }
              } else {
                const plot = chartsObject[index];
                this.setActiveFilters(plot);
                const chart = {};
                if (chartsObject.charts[plot.id]) {
                  chartsObject.charts.push(chart);
                }
                else chartsObject.charts = [chart];
                chart.filters = plot.filters;
                chart.layout = plot.plot.layout;
                chart.tools = plot.tools;
                chart.layerId = plot.qgs_layer_id;
                chart.title = plot.plot.layout.title;
                chart.data = null;
              }
            });
            this.showCharts = true;

            this.removeInactivePlotIds();

            resolve(chartsObject);
          })
      }
    });
  };

  /**
   *
   */
  this.removeInactivePlotIds = function(){
    if (false === this.state.tools.map.toggled){
      this.keyMapMoveendEvent.plotIds = this.keyMapMoveendEvent.plotIds.filter(plotId => plotId.active);
      if (this.keyMapMoveendEvent.plotIds.length === 0 && this.keyMapMoveendEvent.key ) {
        this.handleKeyMapMoveendEvent({listen: false});
      }
    }
  };

  /**
   *
   * @returns {*}
   */
  this.getChartLayout = function() {
    return this.config.plots[0].layout;
  };
  /**
   *
   * @returns {*}
   */
  this.getChartConfig = function(){
    return this.config.plots[0].config;
  };

  /**
   * Called when queryResultService emit event show-chart
   * @param bool <Boolean>
   * @param ids <Array>
   * @param container
   * @param relationData
   * @returns {Promise<unknown>}
   */
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
            });
            component.$mount();
            this.chartContainers.find(queryResultsContainer => container.selector === queryResultsContainer.container.selector).component = component;
          } else {
            // called from sidebar component
            this.onceafter('chartsReady', ()=> {
              resolve()
            });
            const self = this;
            GUI.showContent({
              closable: false,
              title: 'plugins.qplotly.title',
              style: {
                title: {
                  fontSize: '1.3em'
                }
              },
              headertools: [
                Vue.extend({
                  ...HeaderContentAction,
                  data(){
                    return {
                      state: self.state,
                      tools: {
                        map: {
                          show: self.state.geolayer && !self.relationData,
                          disabled: true
                        }
                      }
                    }
                  },
                  methods: {
                    async showMapFeaturesCharts(){
                      const {charts, order } = await self.showMapFeaturesAllCharts(true);
                      self.emit('change-charts',{
                        charts,
                        order
                      });
                    }
                  }
                })
              ],
              content
            });
          }
        })
      } else {
        if (container) {
          this.clearChartContainers(container);
        } else {
          GUI.closeContent();
        }
        resolve();
      }
    })
  };

  /**
   * Clear method
   */
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
    this.queryResultService.removeListener('show-charts', this.showChartsOnContainer);
    this.queryResultService.un('closeComponent', this.closeComponentKeyEevent);
    this.closeComponentKeyEevent = null;
    GUI.closeContent();
    layersId = null;
    this.mainbboxtool = null;
    this.queryResultService = null;
  };
}

inherit(Service, PluginService);

export default new Service();

 
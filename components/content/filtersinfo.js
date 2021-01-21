module.exports = {
  name: 'filtersinfo',
  props:{
    filters: {
      type: Array,
      default: []
    }
  },
  render(h){
    return h('ul', {
      style: {
        listStyleType: 'none',
        padding: '0',
        fontWeight: 'normal'
      }
    }, this.filters.map(filter => h('li', {
       directives: [{
         name: 't-plugin',
         value: `qplotly.filters.${filter}`
       }]
      }))
    )
  }
};
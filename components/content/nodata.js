module.exports = {
  props:{
    title: {
      type: String
    }
  },
  render(h){
    return h('div', [
      h('h4', {
        style: {
          fontWeight: 'bold'
        },
        class:{
          'skin-color':true
        }
      },`${this.$props.title}`),
      h('div', {
        directives: [{
          name:'t-plugin',
          value: 'qplotly.no_data'
        }],
        style: {
          fontWeight: 'bold'
        },
        class: {
          'skin-color': true
        }
      })
    ])
  }
};
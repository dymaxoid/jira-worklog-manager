#!/usr/bin/env node

const moment = require('moment')
const { flatten } = require('lodash')

module.exports = async (options, { jira }) => {
  try {
    const getWorklogRetrievalPromises = options => {
      const periodType = options.week
        ? 'isoWeek'
        : options.month
          ? 'month'
          : null
      let promises = []

      if (periodType) {
        const startOfPeriod = moment().startOf(periodType)
        const endOfPeriod = moment().endOf(periodType)
        let days = []
        let day = startOfPeriod

        while (day <= endOfPeriod) {
          days.push(moment(day.toDate()))
          day = day.clone().add(1, 'd')
        }

        promises = days.map(e => jira.retrieveWorklogs(e.format('DD/MM')))
      } else if (options.issue) {
        // For single issue, use the dedicated issue endpoint
        promises.push(jira.retrieveWorklogsFromIssue(options.issue))
      } else {
        // Default to current date if no date specified
        promises.push(jira.retrieveWorklogs(options.date))
      }

      return Promise.all(promises)
    }

    const formatDuration = (timeSpentSeconds) => {
      const duration = moment.duration(timeSpentSeconds, 'seconds')
      return duration.format('h[h] m[m]')
    }

    const results = await getWorklogRetrievalPromises(options)
    let worklogs = []

    if (options.issue) {
      // Handle issue-specific worklog format
      const issueData = results[0].data
      worklogs = issueData.fields.worklog.worklogs.map(entry => ({
        ...entry,
        issueKey: options.issue
      }))
    } else {
      // Handle date-based worklog format
      worklogs = flatten(results.filter(e => e && e.length > 0))
    }

    // Sort worklogs by date
    worklogs.sort((a, b) => moment(a.started).format('X') - moment(b.started).format('X'))

    if (worklogs.length === 0) {
      process.stdout.write('No work logs found for the specified period.\n')
      return
    }

    // Group worklogs by date for better readability
    const worklogsByDate = worklogs.reduce((acc, entry) => {
      const date = moment(entry.started).format('YYYY-MM-DD')
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(entry)
      return acc
    }, {})

    // Output worklogs in readable format
    Object.keys(worklogsByDate).sort().forEach(date => {
      const dateWorklogs = worklogsByDate[date]
      const formattedDate = moment(date).format('dddd, MMMM D, YYYY')
      const separator = '-'.repeat(50)

      process.stdout.write(`\n${formattedDate}\n`)
      process.stdout.write(`${separator}\n\n`)

      dateWorklogs.forEach(entry => {
        const author = entry.author.displayName
        const time = moment(entry.started).format('HH:mm')
        const duration = formatDuration(entry.timeSpentSeconds)
        const issueKey = entry.issueKey

        process.stdout.write(`${author} - ${time} (${duration})\n`)
        if (issueKey) {
          process.stdout.write(`Issue: ${issueKey}\n`)
        }
        process.stdout.write(separator + '\n')

        // Handle multiline comments with proper formatting
        if (entry.comment) {
          const commentLines = entry.comment.split('\n')
          commentLines.forEach(line => {
            process.stdout.write(line + '\n')
          })
        } else {
          process.stdout.write('No comment provided.\n')
        }
        process.stdout.write('\n')
      })
    })

    // Output summary
    const totalTimeSpent = worklogs.reduce((acc, entry) => acc + entry.timeSpentSeconds, 0)
    const totalDuration = formatDuration(totalTimeSpent)
    const separator = '-'.repeat(50)

    process.stdout.write(`${separator}\n`)
    process.stdout.write(`Total time: ${totalDuration}\n`)
    process.stdout.write(`Total entries: ${worklogs.length}\n`)

  } catch (e) {
    throw e
  }
}

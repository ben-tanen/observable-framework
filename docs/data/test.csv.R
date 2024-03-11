my_data <- data.frame(
  Name = c("Alice", "Bob", "Charlie"),
  Age = c(25, 30, 28)
)

# Export the dataframe to stdout as a CSV file
write.csv(my_data, file = "", row.names = FALSE)